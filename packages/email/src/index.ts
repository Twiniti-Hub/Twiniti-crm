import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { z } from "zod";

const emailListSchema = z.union([z.string().email(), z.array(z.string().email()).min(1)]);

const sendEmailInputSchema = z.object({
  apiKey: z.string().min(1),
  from: z.string().min(1),
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
  bcc: emailListSchema.optional(),
  cc: emailListSchema.optional(),
  replyTo: emailListSchema.optional(),
  headers: z.record(z.string()).optional(),
  idempotencyKey: z.string().min(1).optional()
});

export type SendEmailInput = z.infer<typeof sendEmailInputSchema>;

export function createResendClient(apiKey: string): Resend {
  return new Resend(apiKey);
}

function encryptionKey(key: string): Buffer {
  const value = Buffer.from(key, "base64");
  if (value.length !== 32) throw new Error("RESEND_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return value;
}

export function encryptResendSecret(secret: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptResendSecret(value: string, key: string): string {
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid encrypted Resend credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(key), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

export async function validateResendApiKey(apiKey: string, domain: string): Promise<{ valid: boolean; domainId?: string; verified: boolean }> {
  const response = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) return { valid: false, verified: false };
  const body = await response.json() as { data?: Array<{ id?: string; name?: string; status?: string }> };
  const match = body.data?.find((item) => item.name?.toLowerCase() === domain.toLowerCase());
  return { valid: true, domainId: match?.id, verified: match?.status === "verified" };
}

export async function sendEmail(input: SendEmailInput) {
  const parsed = sendEmailInputSchema.parse(input);
  const client = createResendClient(parsed.apiKey);
  const result = await client.emails.send(
    {
      from: parsed.from,
      to: parsed.to,
      subject: parsed.subject,
      html: parsed.html,
      text: parsed.text,
      bcc: parsed.bcc,
      cc: parsed.cc,
      replyTo: parsed.replyTo,
      headers: parsed.headers
    },
    parsed.idempotencyKey ? { idempotencyKey: parsed.idempotencyKey } : undefined
  );
  return result;
}

export type ReceivedEmail = {
  id: string;
  to?: string[];
  from?: string;
  cc?: string[] | null;
  bcc?: string[] | null;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string | string[] | undefined>;
  message_id?: string | null;
  created_at?: string | null;
};

export async function getReceivedEmail(input: { apiKey: string; emailId: string }): Promise<{
  data: ReceivedEmail | null;
  error: unknown;
}> {
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(input.emailId)}`, {
    headers: { Authorization: `Bearer ${input.apiKey}` }
  });
  const body = await response.json() as { data?: ReceivedEmail; error?: unknown };
  if (!response.ok) return { data: null, error: body.error ?? `Resend receiving request failed (${response.status})` };
  return { data: body.data ?? null, error: null };
}

/**
 * Lightweight webhook signature check for local/dev.
 * Production should use Resend's official Svix verification (svix library / Resend helpers).
 * Accepts either an exact hex digest match or a header that includes the HMAC-SHA256 hex digest
 * (Svix-style `v1,<hex>` lists).
 */
export function verifyResendWebhookSignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  const candidates = signatureHeader
    .split(" ")
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes("=") ? part.slice(part.indexOf("=") + 1) : part));

  if (signatureHeader === digest || candidates.includes(digest)) {
    return true;
  }

  try {
    const expected = Buffer.from(digest, "utf8");
    const provided = Buffer.from(signatureHeader, "utf8");
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function renderTemplate(html: string, tokens: Record<string, string>): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : "";
  });
}

export function personalizeForContact(
  html: string,
  contact: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    properties?: Record<string, unknown>;
  }
): string {
  const firstName = contact.firstName ?? "";
  const lastName = contact.lastName ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const tokens: Record<string, string> = {
    firstName,
    lastName,
    fullName,
    email: contact.email,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    firstname: firstName,
    lastname: lastName
  };

  for (const [key, value] of Object.entries(contact.properties ?? {})) {
    const rendered = value == null ? "" : Array.isArray(value) ? value.join(", ") : String(value);
    tokens[key] = rendered;
    tokens[`properties.${key}`] = rendered;
  }

  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : "";
  });
}
