import { createHash, randomBytes } from "node:crypto";
import { externalToolMetadataSchema, toolTrustDecisionSchema, type ExternalToolMetadata, type ToolTrustDecision } from "@twiniti/contracts";

export type RunCredentialRecord = {
  tokenHash: string;
  audience: string;
  expiresAt: Date;
  revokedAt: Date | null;
  scopes: string[];
  allowedTools: string[];
};

export function hashRunCredential(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mintRunCredential(input: { audience: string; scopes: string[]; allowedTools: string[]; ttlSeconds?: number; now?: Date }) {
  const now = input.now ?? new Date();
  const ttlSeconds = Math.min(Math.max(input.ttlSeconds ?? 300, 30), 900);
  const token = `twrc_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  return {
    token,
    tokenHash: hashRunCredential(token),
    audience: input.audience,
    scopes: [...new Set(input.scopes)],
    allowedTools: [...new Set(input.allowedTools)],
    issuedAt: now,
    expiresAt,
    revokedAt: null
  };
}

export function validateRunCredential(record: RunCredentialRecord, token: string, expectedAudience: string, now = new Date()) {
  return record.tokenHash === hashRunCredential(token)
    && record.audience === expectedAudience
    && !record.revokedAt
    && record.expiresAt.getTime() > now.getTime();
}

export function assessExternalToolMetadata(raw: unknown): ToolTrustDecision {
  const parsed = externalToolMetadataSchema.safeParse(raw);
  if (!parsed.success) return { trusted: false, reasonCodes: ["invalid_metadata"], allowedScopes: [], allowSideEffects: false };
  const metadata: ExternalToolMetadata = parsed.data;
  const suspiciousKeys = Object.keys(metadata.metadata).filter((key) => /instruction|prompt|system|override|credential|secret/i.test(key));
  const reasonCodes = [...suspiciousKeys.map(() => "untrusted_metadata"), ...(metadata.adapter === "mcp" ? ["external_adapter"] : [])];
  return toolTrustDecisionSchema.parse({
    trusted: reasonCodes.length === 0 && metadata.sideEffectClass === "none",
    reasonCodes: reasonCodes.length ? reasonCodes : ["validated_schema"],
    allowedScopes: reasonCodes.length ? [] : metadata.declaredScopes,
    allowSideEffects: false
  });
}
