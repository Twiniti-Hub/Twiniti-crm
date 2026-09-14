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

const SVIX_TOLERANCE_SECONDS = 300;

export type ResendWebhookSignedHeaders = {
  id?: string;
  timestamp?: string;
  nowSeconds?: number;
};

function signatureCandidates(signatureHeader: string): string[] {
  const tokens: string[] = [];
  for (const spacePart of signatureHeader.split(/\s+/)) {
    const trimmed = spacePart.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("v1=") || trimmed.startsWith("v0=")) {
      tokens.push(trimmed.slice(3));
      continue;
    }
    if (trimmed.startsWith("v1,") || trimmed.startsWith("v0,")) {
      tokens.push(trimmed.slice(3));
      continue;
    }
    tokens.push(trimmed);
  }
  return tokens.filter((part) => part !== "v1" && part !== "v0");
}

function svixSigningKey(secret: string): Buffer {
  if (secret.startsWith("whsec_")) {
    return Buffer.from(secret.slice("whsec_".length), "base64");
  }
  return Buffer.from(secret, "utf8");
}

function timingSafeEqualUtf8(left: string, right: string): boolean {
  const expected = Buffer.from(left, "utf8");
  const provided = Buffer.from(right, "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function matchesSignature(expected: string, signatureHeader: string, candidates: string[]): boolean {
  if (timingSafeEqualUtf8(signatureHeader, expected)) return true;
  return candidates.some((candidate) => timingSafeEqualUtf8(candidate, expected));
}

/**
 * Verifies Resend/Svix webhook signatures.
 * Production Resend webhooks sign `${svix-id}.${svix-timestamp}.${rawBody}` with the
 * base64 `whsec_` key and send `v1,<base64>` signatures. Legacy hex HMAC of the body
 * remains accepted for local tests.
 */
export function verifyResendWebhookSignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string,
  signedHeaders?: ResendWebhookSignedHeaders
): boolean {
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader) {
    return false;
  }

  const candidates = signatureCandidates(signatureHeader);
  const id = signedHeaders?.id?.trim();
  const timestamp = signedHeaders?.timestamp?.trim();
  if (id && timestamp) {
    const timestampSeconds = Number(timestamp);
    const nowSeconds = signedHeaders?.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > SVIX_TOLERANCE_SECONDS) {
      return false;
    }
    const expectedBase64 = createHmac("sha256", svixSigningKey(secret))
      .update(`${id}.${timestamp}.${payload}`, "utf8")
      .digest("base64");
    if (matchesSignature(expectedBase64, signatureHeader, candidates)) {
      return true;
    }
  }

  const digest = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return matchesSignature(digest, signatureHeader, candidates);
}

function collectAddressValues(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAddressValues(item, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.email === "string") into.push(record.email);
  if (typeof record.address === "string") into.push(record.address);
}

function domainsFromAddressText(value: string): string[] {
  const matches = value.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi) ?? [];
  return matches.map((match) => {
    const at = match.lastIndexOf("@");
    return match.slice(at + 1).toLowerCase();
  });
}

export function extractResendWebhookDomains(payload: Record<string, unknown>): string[] {
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : payload;
  const bags: unknown[] = [data.to, data.from, data.cc, data.bcc, data.reply_to, data.received_for];
  if (data.headers && typeof data.headers === "object") {
    bags.push(Object.values(data.headers as Record<string, unknown>));
  }
  const addresses: string[] = [];
  for (const bag of bags) collectAddressValues(bag, addresses);
  const domains = new Set<string>();
  for (const address of addresses) {
    for (const domain of domainsFromAddressText(address)) domains.add(domain);
  }
  return [...domains];
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
