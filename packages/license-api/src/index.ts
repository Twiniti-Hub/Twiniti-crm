import type { AppEnv } from "@twiniti/config";
import { randomUUID } from "node:crypto";

export type LicenseDecision = "allow" | "restricted" | "deny" | "retry";

export type LicenseCheck = {
  decision: LicenseDecision;
  reasonCode: string;
  organizationId: string;
  userId?: string | null;
  productCode?: string | null;
  planCode?: string | null;
  licenseId?: string | null;
  licenseStatus?: string | null;
  expiresAt?: string | null;
  graceCutoff?: string | null;
  entitlements?: unknown[];
  agentAccess?: boolean;
  limits?: Record<string, unknown>;
  requestId?: string;
};

export type ProvisionOrganizationInput = {
  externalOrganizationId: string;
  organizationName: string;
  billingEmail?: string | null;
  externalUserId: string;
  userSubject: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  productCode: string;
  planCode: string;
  source: "twiniti-crm";
};

export type SubscriptionStateInput = {
  externalOrganizationId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  normalizedState: "pending" | "trialing" | "active" | "grace" | "suspended" | "expired";
  periodEnd?: string | null;
  expiresAt?: string | null;
  graceCutoff?: string | null;
  cancelAtPeriodEnd: boolean;
  sourceEventId: string;
  eventCreatedAt: string;
  source: "twiniti-crm";
};

export type AgentProvisionInput = {
  externalOrganizationId: string;
  externalAgentId: string;
  agentName?: string | null;
  productCode: string;
  source: "twiniti-crm";
};

export type AgentRevokeInput = Omit<AgentProvisionInput, "agentName">;

export type CheckUserLicenseInput = {
  externalOrganizationId: string;
  externalUserId?: string | null;
  userSubject?: string | null;
  email?: string | null;
  productCode: string;
  source: "twiniti-crm";
};

export type CheckAgentLicenseInput = {
  externalOrganizationId: string;
  externalAgentId: string;
  productCode: string;
  source: "twiniti-crm";
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  requestId?: string;
  error?: string;
  message?: string;
};

type LicenseApiConfig = Pick<
  AppEnv,
  | "LICENSE_API_URL"
  | "LICENSE_API_API_KEY"
  | "LICENSE_API_PRODUCT_CODE"
  | "LICENSE_API_PLAN_CODE"
  | "LICENSE_API_REQUEST_TIMEOUT_MS"
  | "LICENSE_API_CACHE_TTL_MS"
  | "LICENSE_API_PROVISION_PATH"
  | "LICENSE_API_AGENT_PROVISION_PATH"
  | "LICENSE_API_AGENT_REVOKE_PATH"
  | "LICENSE_API_SYNC_PATH"
  | "LICENSE_API_CHECK_PATH"
  | "LICENSE_API_REQUIRED"
>;

export class LicenseApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(message: string, options: { status?: number; retryable?: boolean; requestId?: string } = {}) {
    super(message);
    this.name = "LicenseApiError";
    this.status = options.status ?? 0;
    this.retryable = options.retryable ?? true;
    this.requestId = options.requestId;
  }
}

function normalizeDecision(value: unknown): LicenseDecision {
  const decision = String(value ?? "").toLowerCase();
  if (decision === "allow" || decision === "continue") return "allow";
  if (decision === "allow_with_restrictions" || decision === "restricted" || decision === "grace") return "restricted";
  if (decision === "deny" || decision === "denied") return "deny";
  return "retry";
}

function normalizeCheck(data: unknown, fallbackOrganizationId: string, requestId?: string): LicenseCheck {
  const value = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const license = value.license && typeof value.license === "object" ? value.license as Record<string, unknown> : {};
  const user = value.user && typeof value.user === "object" ? value.user as Record<string, unknown> : {};
  return {
    decision: normalizeDecision(value.decision),
    reasonCode: String(value.reasonCode ?? value.reason_code ?? "LICENSE_API_UNSPECIFIED"),
    organizationId: String(value.organizationId ?? value.organization_id ?? fallbackOrganizationId),
    userId: (value.userId ?? value.user_id ?? user.id ?? null) as string | null,
    productCode: (value.productCode ?? value.product_code ?? license.productCode ?? null) as string | null,
    planCode: (value.planCode ?? value.plan_code ?? license.planCode ?? null) as string | null,
    licenseId: (value.licenseId ?? value.license_id ?? license.id ?? null) as string | null,
    licenseStatus: (value.licenseStatus ?? value.license_status ?? license.status ?? user.status ?? null) as string | null,
    expiresAt: (value.expiresAt ?? value.expires_at ?? license.expiresAt ?? license.endDate ?? null) as string | null,
    graceCutoff: (value.graceCutoff ?? value.grace_cutoff ?? license.graceCutoff ?? null) as string | null,
    entitlements: Array.isArray(value.entitlements) ? value.entitlements : [],
    agentAccess: value.agentAccess === true || value.agent_access === true,
    limits: value.limits && typeof value.limits === "object" ? value.limits as Record<string, unknown> : {},
    requestId: String(value.requestId ?? requestId ?? "") || undefined
  };
}

export class LicenseApiClient {
  private readonly config: LicenseApiConfig;
  private readonly cache = new Map<string, { expiresAt: number; value: LicenseCheck }>();

  constructor(config: LicenseApiConfig) {
    this.config = config;
  }

  get configured() {
    return Boolean(this.config.LICENSE_API_URL && this.config.LICENSE_API_API_KEY);
  }

  get required() {
    return this.config.LICENSE_API_REQUIRED;
  }

  private url(path: string) {
    return `${this.config.LICENSE_API_URL!.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  }

  private async request<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
    if (!this.configured) {
      throw new LicenseApiError("License_API is not configured", { retryable: false });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.LICENSE_API_REQUEST_TIMEOUT_MS);
    const requestId = randomUUID();
    try {
      const response = await fetch(this.url(path), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "x-api-key": this.config.LICENSE_API_API_KEY,
          "x-client-app": "twiniti-crm",
          "x-request-id": requestId,
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let parsed: ApiEnvelope<T> = {};
      try {
        parsed = text ? JSON.parse(text) as ApiEnvelope<T> : {};
      } catch {
        parsed = {};
      }
      if (!response.ok) {
        throw new LicenseApiError(parsed.message ?? parsed.error ?? `License_API request failed (${response.status})`, {
          status: response.status,
          retryable: response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
          requestId: parsed.requestId ?? requestId
        });
      }
      return (parsed.data ?? parsed) as T;
    } catch (error) {
      if (error instanceof LicenseApiError) throw error;
      throw new LicenseApiError(error instanceof Error ? error.message : "License_API request failed", {
        retryable: true,
        requestId
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async provisionOrganization(input: ProvisionOrganizationInput, idempotencyKey: string) {
    return this.request<Record<string, unknown>>(this.config.LICENSE_API_PROVISION_PATH, input, idempotencyKey);
  }

  async provisionAgent(input: AgentProvisionInput, idempotencyKey: string) {
    return this.request<Record<string, unknown>>(this.config.LICENSE_API_AGENT_PROVISION_PATH, input, idempotencyKey);
  }

  async revokeAgent(input: AgentRevokeInput, idempotencyKey: string) {
    return this.request<Record<string, unknown>>(this.config.LICENSE_API_AGENT_REVOKE_PATH, input, idempotencyKey);
  }

  async synchronizeSubscriptionState(input: SubscriptionStateInput, idempotencyKey: string) {
    return this.request<Record<string, unknown>>(this.config.LICENSE_API_SYNC_PATH, input, idempotencyKey);
  }

  async checkUserLicense(input: CheckUserLicenseInput): Promise<LicenseCheck> {
    const cacheKey = [input.externalOrganizationId, input.externalUserId ?? "", input.productCode].join(":");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const data = await this.request<unknown>(this.config.LICENSE_API_CHECK_PATH, input, `license-check:${cacheKey}`);
      const value = normalizeCheck(data, input.externalOrganizationId);
      this.cache.set(cacheKey, { expiresAt: Date.now() + this.config.LICENSE_API_CACHE_TTL_MS, value });
      return value;
    } catch (error) {
      if (error instanceof LicenseApiError) {
        return {
          decision: "retry",
          reasonCode: error.retryable ? "LICENSE_API_UNAVAILABLE" : "LICENSE_API_REQUEST_FAILED",
          organizationId: input.externalOrganizationId,
          requestId: error.requestId
        };
      }
      return {
        decision: "retry",
        reasonCode: "LICENSE_API_UNAVAILABLE",
        organizationId: input.externalOrganizationId
      };
    }
  }

  async checkAgentLicense(input: CheckAgentLicenseInput): Promise<LicenseCheck> {
    const cacheKey = ["agent", input.externalOrganizationId, input.externalAgentId, input.productCode].join(":");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const data = await this.request<unknown>(this.config.LICENSE_API_CHECK_PATH, {
        ...input,
        principalType: "agent",
        externalAgentId: input.externalAgentId
      }, `license-check:${cacheKey}`);
      const value = normalizeCheck(data, input.externalOrganizationId);
      this.cache.set(cacheKey, { expiresAt: Date.now() + this.config.LICENSE_API_CACHE_TTL_MS, value });
      return value;
    } catch (error) {
      if (error instanceof LicenseApiError) {
        return {
          decision: "retry",
          reasonCode: error.retryable ? "LICENSE_API_UNAVAILABLE" : "LICENSE_API_REQUEST_FAILED",
          organizationId: input.externalOrganizationId,
          agentAccess: false,
          requestId: error.requestId
        };
      }
      return {
        decision: "retry",
        reasonCode: "LICENSE_API_UNAVAILABLE",
        organizationId: input.externalOrganizationId,
        agentAccess: false
      };
    }
  }
}

export function createLicenseApiClient(env: LicenseApiConfig) {
  const key = [
    env.LICENSE_API_URL ?? "",
    env.LICENSE_API_PROVISION_PATH,
    env.LICENSE_API_AGENT_PROVISION_PATH,
    env.LICENSE_API_AGENT_REVOKE_PATH,
    env.LICENSE_API_SYNC_PATH,
    env.LICENSE_API_CHECK_PATH,
    env.LICENSE_API_CACHE_TTL_MS
  ].join("|");
  const existing = clientCache.get(key);
  if (existing) return existing;
  const client = new LicenseApiClient(env);
  clientCache.set(key, client);
  return client;
}

export type { LicenseApiConfig };

const clientCache = new Map<string, LicenseApiClient>();
