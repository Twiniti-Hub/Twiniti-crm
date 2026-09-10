import { HexclaveServerApp } from "@hexclave/js";
import { hasHexclaveServerConfiguration, isSuperAdminEmail, type AppEnv } from "@twiniti/config";
import type { RegionCode } from "@twiniti/contracts";
import { createLicenseApiClient, type LicenseCheck } from "@twiniti/license-api";
import {
  ensureBootstrapOrg,
  findAgentByCredentialHash,
  findCrmUserBySubject,
  findOrCreateCrmUser,
  getOrganizationBilling,
  getOrganizationById,
  hashCredential,
  touchAgent,
  updateOrganizationLicense,
  type Db
} from "@twiniti/db";

export type AuthActor = {
  type: "user" | "agent" | "system";
  id: string;
  organizationId: string | null;
  role?: string;
  scopes?: string[];
  email?: string | null;
  displayName?: string | null;
  needsSetup?: boolean;
  isSuperAdmin?: boolean;
  hexclaveSubject?: string;
  organizationName?: string | null;
  regionCode?: RegionCode | null;
  countryCode?: string | null;
  billingStatus?: string;
  licenseDecision?: string;
  licenseReasonCode?: string;
  licenseStatus?: string | null;
};

export type CrmRole = "admin" | "member";

export const ROLE_RANK: Record<CrmRole, number> = {
  member: 1,
  admin: 2
};

/** Map legacy role names used in older call sites onto the two-role model. */
const LEGACY_ROLE_ALIASES: Record<string, CrmRole> = {
  viewer: "member",
  analyst: "member",
  marketer: "member",
  member: "member",
  admin: "admin",
  owner: "admin"
};

export type RequestLike = {
  headers:
    | { get(name: string): string | null | undefined }
    | Record<string, string | string[] | null | undefined>;
};

export const WORKSPACE_CONTEXT_HEADER = "x-twiniti-workspace-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HexclaveTokenStoreRequest = {
  headers: { get: (name: string) => string | null } | Record<string, string | null>;
};

export function createHexclaveServerApp(env?: Partial<AppEnv>) {
  return new HexclaveServerApp({
    tokenStore: null,
    projectId: env?.HEXCLAVE_PROJECT_ID || undefined,
    secretServerKey: env?.HEXCLAVE_SECRET_SERVER_KEY || undefined,
    baseUrl: env?.HEXCLAVE_BASE_URL || undefined,
    urls: {
      default: {
        type: "hosted"
      }
    }
  });
}

function normalizeRole(role: string | undefined): CrmRole | null {
  if (!role) return null;
  return LEGACY_ROLE_ALIASES[role] ?? null;
}

function roleRank(role: string | undefined): number {
  const normalized = normalizeRole(role);
  if (!normalized) return 0;
  return ROLE_RANK[normalized];
}

export function requireRole(actor: AuthActor, minRole: CrmRole | "viewer" | "analyst" | "marketer" | "owner"): boolean {
  const required = LEGACY_ROLE_ALIASES[minRole] ?? (minRole as CrmRole);
  return roleRank(actor.role) >= ROLE_RANK[required];
}

export function hasScope(actor: AuthActor, scope: string): boolean {
  if (!actor.scopes || actor.scopes.length === 0) {
    return false;
  }
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

export function assertScope(actor: AuthActor, scope: string): void {
  if (!hasScope(actor, scope)) {
    const error = new Error(`Missing required scope: ${scope}`) as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export function assertOrganization(actor: AuthActor): string {
  if (!actor.organizationId) {
    const error = new Error("Company setup required") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  return actor.organizationId;
}

function getHeader(headers: RequestLike["headers"], name: string): string | undefined {
  const lower = name.toLowerCase();
  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get(name: string): string | null | undefined }).get(name)
      ?? (headers as { get(name: string): string | null | undefined }).get(lower);
    return value ?? undefined;
  }
  const record = headers as Record<string, string | string[] | null | undefined>;
  const raw = record[name] ?? record[lower] ?? record[name.toUpperCase()];
  if (Array.isArray(raw)) return raw[0] ?? undefined;
  return raw ?? undefined;
}

/** Returns a syntactically valid workspace context requested by a client. */
export function getRequestedWorkspaceId(headers: RequestLike["headers"]): string | undefined {
  const value = getHeader(headers, WORKSPACE_CONTEXT_HEADER)?.trim();
  return value && UUID_PATTERN.test(value) ? value : undefined;
}

function toHexclaveTokenStore(requestLike: RequestLike): HexclaveTokenStoreRequest {
  const headers = requestLike.headers;
  if (typeof (headers as { get?: unknown }).get === "function") {
    return {
      headers: {
        get: (name: string) => {
          const value = (headers as { get(name: string): string | null | undefined }).get(name);
          return value ?? null;
        }
      }
    };
  }

  const record = headers as Record<string, string | string[] | null | undefined>;
  const normalized: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      normalized[key] = value[0] ?? null;
    } else {
      normalized[key] = value ?? null;
    }
  }
  return { headers: normalized };
}

function parseScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function resolveBootstrapActor(db: Db, env: AppEnv): Promise<AuthActor> {
  const org = await ensureBootstrapOrg(db, {
    orgName: env.BOOTSTRAP_ORG_NAME,
    ownerSubject: "dev-owner",
    ownerEmail: "owner@localhost"
  });
  const user = await findOrCreateCrmUser(db, {
    organizationId: org.id,
    subject: "dev-owner",
    email: "owner@localhost",
    displayName: "Dev Owner",
    defaultRole: "admin"
  });
  return {
    type: "user",
    id: user.id,
    organizationId: user.organizationId,
    role: normalizeRole(user.role) ?? "admin",
    email: user.email,
    displayName: user.displayName,
    needsSetup: false,
    isSuperAdmin: true,
    hexclaveSubject: user.hexclaveSubject,
    organizationName: org.name,
    regionCode: org.residencyRegion as RegionCode,
    countryCode: user.countryCode ?? null,
    billingStatus: "active"
  };
}

function parseLicenseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function checkOrganizationLicense(
  db: Db,
  env: AppEnv,
  input: { organizationId: string; userId?: string | null; subject?: string | null; email?: string | null },
  localStatus: string
) {
  const client = createLicenseApiClient(env);
  const billingActive = localStatus === "active" || localStatus === "trialing";
  const billing = await getOrganizationBilling(db, input.organizationId);
  const provisioned =
    Boolean(billing?.licenseId)
    && billing?.licenseProvisioningStatus === "provisioned";

  // Stripe-active/trialing orgs that already completed License_API provisioning
  // must not stay permanently caged when a regional API is missing License_API
  // secrets or the check endpoint is temporarily unreachable.
  if (!client.configured) {
    if (!client.required) {
      return { billingStatus: localStatus, check: null as LicenseCheck | null };
    }
    if (billingActive && provisioned) {
      return { billingStatus: localStatus, check: null as LicenseCheck | null };
    }
    return {
      billingStatus: "license_unavailable",
      check: null as LicenseCheck | null
    };
  }

  const check = await client.checkUserLicense({
    externalOrganizationId: input.organizationId,
    externalUserId: input.userId ?? null,
    userSubject: input.subject ?? null,
    email: input.email ?? null,
    productCode: env.LICENSE_API_PRODUCT_CODE,
    source: "twiniti-crm"
  });
  await updateOrganizationLicense(db, input.organizationId, {
    licenseDecision: check.decision,
    licenseStatus: check.licenseStatus ?? null,
    licenseId: check.licenseId ?? billing?.licenseId ?? null,
    licenseReasonCode: check.reasonCode,
    licenseOrganizationId: check.organizationId,
    licenseExpiresAt: parseLicenseDate(check.expiresAt),
    licenseGraceCutoff: parseLicenseDate(check.graceCutoff),
    lastLicenseCheckedAt: new Date()
  });

  if (check.decision === "allow" && billingActive) {
    return { billingStatus: localStatus, check };
  }
  if (check.decision === "retry" && billingActive && provisioned) {
    return { billingStatus: localStatus, check };
  }
  return {
    billingStatus: check.decision === "restricted"
      ? "restricted"
      : check.decision === "deny" ? "license_denied" : "license_unavailable",
    check
  };
}

export async function resolveRequestActor(
  db: Db,
  requestLike: RequestLike,
  env: AppEnv
): Promise<AuthActor | null> {
  const authorization = getHeader(requestLike.headers, "authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (bearer?.startsWith("twiniti_agent_")) {
    const agent = await findAgentByCredentialHash(db, hashCredential(bearer));
    if (!agent) return null;
    await touchAgent(db, agent.id);
    const billing = await getOrganizationBilling(db, agent.organizationId);
    const organization = await getOrganizationById(db, agent.organizationId);
    const client = createLicenseApiClient(env);
    const check = client.configured
      ? await client.checkAgentLicense({
          externalOrganizationId: agent.organizationId,
          externalAgentId: agent.id,
          productCode: env.LICENSE_API_PRODUCT_CODE,
          source: "twiniti-crm"
        })
      : null;
    if (check) {
      await updateOrganizationLicense(db, agent.organizationId, {
        licenseDecision: check.decision,
        licenseStatus: check.licenseStatus ?? null,
        licenseId: check.licenseId ?? null,
        licenseReasonCode: check.reasonCode,
        licenseOrganizationId: check.organizationId,
        licenseExpiresAt: parseLicenseDate(check.expiresAt),
        licenseGraceCutoff: parseLicenseDate(check.graceCutoff),
        lastLicenseCheckedAt: new Date()
      });
    }
    const effectiveCheck = check && check.decision === "allow" && check.agentAccess !== true
      ? { ...check, decision: "deny" as const, reasonCode: "AGENT_ACCESS_NOT_ENTITLED" }
      : check;
    const license = effectiveCheck
      ? {
          billingStatus: effectiveCheck.decision === "allow" && (billing?.status === "active" || billing?.status === "trialing")
            ? billing.status
            : effectiveCheck.decision === "restricted" ? "restricted" : effectiveCheck.decision === "deny" ? "license_denied" : "license_unavailable",
          check: effectiveCheck
        }
      : await checkOrganizationLicense(db, env, {
      organizationId: agent.organizationId,
      userId: agent.id,
      subject: agent.id
    }, billing?.status ?? "pending");
    return {
      type: "agent",
      id: agent.id,
      organizationId: agent.organizationId,
      scopes: parseScopes(agent.scopes),
      displayName: agent.name,
      organizationName: organization?.name ?? null,
      regionCode: (organization?.residencyRegion as RegionCode | undefined) ?? null,
      needsSetup: false,
      isSuperAdmin: false,
      billingStatus: license.billingStatus,
      licenseDecision: license.check?.decision,
      licenseReasonCode: license.check?.reasonCode,
      licenseStatus: license.check?.licenseStatus
    };
  }

  const bootstrapMode = !hasHexclaveServerConfiguration(env);
  if (bootstrapMode) {
    return resolveBootstrapActor(db, env);
  }

  const hexclaveServerApp = createHexclaveServerApp(env);
  const tokenStore = toHexclaveTokenStore(requestLike);
  const user = await hexclaveServerApp.getUser({ tokenStore, or: "return-null" });
  if (!user) return null;

  const subject = String((user as { id?: string }).id ?? "");
  if (!subject) return null;

  const email =
    (user as { primaryEmail?: string | null }).primaryEmail
    ?? (user as { email?: string | null }).email
    ?? null;
  const displayName = (user as { displayName?: string | null }).displayName ?? null;
  const superAdmin = isSuperAdminEmail(email, env);
  const crmUser = await findCrmUserBySubject(db, subject);

  // A platform super admin must explicitly choose a workspace. The database
  // lookup below is the authorization boundary; an arbitrary client-supplied
  // ID never becomes an organization context on its own. Missing, stale, or
  // invalid context deliberately returns the admin-console setup state.
  if (superAdmin) {
    const requestedWorkspaceId = getRequestedWorkspaceId(requestLike.headers);
    if (requestedWorkspaceId) {
      const workspace = await getOrganizationById(db, requestedWorkspaceId);
      if (workspace) {
        const billing = await getOrganizationBilling(db, workspace.id);
        return {
          type: "user",
          id: subject,
          organizationId: workspace.id,
          role: "admin",
          email,
          displayName,
          needsSetup: false,
          isSuperAdmin: true,
          hexclaveSubject: subject,
          organizationName: workspace.name,
          regionCode: workspace.residencyRegion as RegionCode,
          countryCode: null,
          billingStatus: billing?.status ?? "pending"
        };
      }
    }
    if (crmUser?.active) {
      const organization = await getOrganizationById(db, crmUser.organizationId);
      const billing = await getOrganizationBilling(db, crmUser.organizationId);
      return {
        type: "user",
        id: crmUser.id,
        organizationId: crmUser.organizationId,
        role: normalizeRole(crmUser.role) ?? "admin",
        email: crmUser.email ?? email,
        displayName: crmUser.displayName ?? displayName,
        needsSetup: false,
        isSuperAdmin: true,
        hexclaveSubject: subject,
        organizationName: organization?.name ?? null,
        regionCode: (organization?.residencyRegion as RegionCode | undefined) ?? null,
        countryCode: crmUser.countryCode ?? null,
        billingStatus: billing?.status ?? "pending"
      };
    }
    return {
      type: "user",
      id: subject,
      organizationId: null,
      role: undefined,
      email,
      displayName,
      needsSetup: true,
      isSuperAdmin: true,
      hexclaveSubject: subject,
      organizationName: null
    };
  }

  if (!crmUser || !crmUser.active) {
    return {
      type: "user",
      id: subject,
      organizationId: null,
      role: undefined,
      email,
      displayName,
      needsSetup: true,
      isSuperAdmin: superAdmin,
      hexclaveSubject: subject,
      organizationName: null
    };
  }

  const organization = await getOrganizationById(db, crmUser.organizationId);
  const billing = await getOrganizationBilling(db, crmUser.organizationId);
  const license = superAdmin
    ? { billingStatus: billing?.status ?? "pending", check: null as LicenseCheck | null }
    : await checkOrganizationLicense(db, env, {
        organizationId: crmUser.organizationId,
        userId: crmUser.id,
        subject,
        email: crmUser.email ?? email
    }, billing?.status ?? "pending");

  return {
    type: "user",
    id: crmUser.id,
    organizationId: crmUser.organizationId,
    role: normalizeRole(crmUser.role) ?? "member",
    email: crmUser.email ?? email,
    displayName: crmUser.displayName ?? displayName,
    needsSetup: false,
    isSuperAdmin: superAdmin,
    hexclaveSubject: subject,
    organizationName: organization?.name ?? null,
    regionCode: (organization?.residencyRegion as RegionCode | undefined) ?? null,
    countryCode: crmUser.countryCode ?? null,
    billingStatus: license.billingStatus,
    licenseDecision: license.check?.decision,
    licenseReasonCode: license.check?.reasonCode,
    licenseStatus: license.check?.licenseStatus
  };
}
