import { createHash, randomBytes } from "node:crypto";

export function hashCredential(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintAgentCredential(): { token: string; hash: string } {
  const token = `twiniti_agent_${randomBytes(24).toString("hex")}`;
  return { token, hash: hashCredential(token) };
}

export function contentHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
