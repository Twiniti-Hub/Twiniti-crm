export type EmailActivityClassification = {
  direction: "inbound" | "outbound";
  activityType: "received" | "replied" | "sent";
};

export function normalizeTrackedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseEmailAddresses(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const result = new Set<string>();
  for (const item of values) {
    if (typeof item !== "string") continue;
    const matches = item.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    for (const match of matches) result.add(normalizeTrackedEmail(match));
  }
  return [...result];
}

export function getEmailHeader(headers: unknown, ...names: string[]): string | null {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return null;
  const entries = Object.entries(headers as Record<string, unknown>);
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
    if (typeof found === "string") return found;
    if (Array.isArray(found) && typeof found[0] === "string") return found[0];
  }
  return null;
}

export function parseMessageReferences(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(" ") : typeof value === "string" ? value : "";
  return raw.split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

export function parseTrackingAddress(value: unknown): { token: string; domain: string } | null {
  for (const address of parseEmailAddresses(value)) {
    const at = address.lastIndexOf("@");
    if (at <= 0) continue;
    const localPart = address.slice(0, at);
    const domain = address.slice(at + 1);
    if (localPart.startsWith("log_") && localPart.length > 4) {
      return { token: localPart.slice(4), domain };
    }
  }
  return null;
}

export function parseTrackingAddressFromValues(values: unknown[]): { token: string; domain: string } | null {
  for (const value of values) {
    const parsed = parseTrackingAddress(value);
    if (parsed) return parsed;
  }
  return null;
}

export function getTrackingToken(value: unknown, domain: string): string | null {
  const parsed = parseTrackingAddress(value);
  if (!parsed) return null;
  return parsed.domain === domain.trim().toLowerCase() ? parsed.token : null;
}

export function getTrackingTokenFromValues(values: unknown[], domain: string): string | null {
  const parsed = parseTrackingAddressFromValues(values);
  if (!parsed) return null;
  return parsed.domain === domain.trim().toLowerCase() ? parsed.token : null;
}

export function classifyEmailActivity(input: {
  fromEmail: string | null;
  contactEmails: string[];
  inReplyTo?: string | null;
  references?: string[];
}): EmailActivityClassification {
  const from = input.fromEmail ? normalizeTrackedEmail(input.fromEmail) : "";
  const knownContact = input.contactEmails.map(normalizeTrackedEmail).includes(from);
  if (knownContact) {
    return {
      direction: "inbound",
      activityType: input.inReplyTo || (input.references?.length ?? 0) > 0 ? "replied" : "received"
    };
  }
  return { direction: "outbound", activityType: "sent" };
}
