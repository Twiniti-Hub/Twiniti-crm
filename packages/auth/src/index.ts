import { HexclaveServerApp } from "@hexclave/js";
import {
  hasHexclaveServerConfiguration,
  isLicenseDevAutoTrialEnabled,
  isSuperAdminEmail,
  type AppEnv
} from "@twiniti/config";
import type { RegionCode } from "@twiniti/contracts";
import { createLicenseApiClient, type LicenseCheck } from "@twiniti/license-api";
import {
  ensureBootstrapOrg,
  findAgentByCredentialHash,
  findCrmUserByEmail,
  findCrmUserBySubject,
  findOrCreateCrmUser,
  getOrganizationBilling,
  getOrganizationById,
  hashCredential,
  listMembershipsForSubject,
  touchAgent,
  updateOrganizationLicense,
  type Db
} from "@twiniti/db";

export type AuthWorkspaceSummary = {
  id: string;
  name: string;
  workspaceKind: "company" | "personal";
  regionCode: RegionCode;
  role: string;
  membershipId: string;
};

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
  primaryEmailVerified?: boolean;
  organizationName?: string | null;
  workspaceKind?: "company" | "personal" | null;
  regionCode?: RegionCode | null;
  countryCode?: string | null;
  billingStatus?: string;
  licenseDecision?: string;
  licenseReasonCode?: string;
  licenseStatus?: string | null;
  workspaces?: AuthWorkspaceSummary[];
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

/** Requires email_events:write plus contacts:create or contacts:update for Graph outbound logging. */
export function assertLogOutboundEmailScopes(actor: AuthActor): void {
  if (actor.type !== "agent") return;
  assertScope(actor, "email_events:write");
  if (!hasScope(actor, "contacts:create") && !hasScope(actor, "contacts:update")) {
    assertScope(actor, "contacts:update");
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

export function assertVerifiedPrimaryEmail(actor: AuthActor): void {
  if (actor.type !== "user") {
    return;
  }
  if (actor.primaryEmailVerified === true) {
    return;
  }
  const error = new Error("Verify your email address before continuing") as Error & {
    statusCode: number;
    errorCode: string;
  };
  error.statusCode = 403;
  error.errorCode = "email_not_verified";
  throw error;
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

type WorkspaceCrmMembership = {
  id: string;
  organizationId: string;
  email?: string | null;
  displayName?: string | null;
  countryCode?: string | null;
  role: string;
  active: boolean;
};

/**
 * Prefer an active CRM membership in the selected workspace for Super Admin
 * workspace-context actors. Tracking addresses and other crm_users FKs key off
 * membership id, not the Hexclave subject.
 */
export function resolveSuperAdminWorkspaceMembership(input: {
  workspaceId: string;
  subjectMembership: WorkspaceCrmMembership | null | undefined;
  emailMembership: WorkspaceCrmMembership | null | undefined;
}): WorkspaceCrmMembership | null {
  const { workspaceId, subjectMembership, emailMembership } = input;
  if (subjectMembership?.active && subjectMembership.organizationId === workspaceId) {
    return subjectMembership;
  }
  if (emailMembership?.active && emailMembership.organizationId === workspaceId) {
    return emailMembership;
  }
  return null;
}

type SubjectMembershipRow = {
  id: string;
  organizationId: string;
  email: string | null;
  displayName: string | null;
  countryCode: string | null;
  role: string;
  active: boolean;
  organizationName: string;
  workspaceKind: string;
  residencyRegion: string;
};

function toWorkspaceSummaries(memberships: SubjectMembershipRow[]): AuthWorkspaceSummary[] {
  return memberships.map((row) => ({
    id: row.organizationId,
    name: row.organizationName,
    workspaceKind: row.workspaceKind === "personal" ? "personal" : "company",
    regionCode: row.residencyRegion as RegionCode,
    role: normalizeRole(row.role) ?? "member",
    membershipId: row.id
  }));
}

/** Pick active membership: validated header, else first company, else first membership. */
export function selectMembershipForRequest(
  memberships: SubjectMembershipRow[],
  requestedWorkspaceId: string | undefined
): SubjectMembershipRow | null {
  const active = memberships.filter((row) => row.active);
  if (!active.length) return null;
  if (requestedWorkspaceId) {
    const matched = active.find((row) => row.organizationId === requestedWorkspaceId);
    if (matched) return matched;
  }
  return active.find((row) => row.workspaceKind === "company") ?? active[0] ?? null;
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
    primaryEmailVerified: true,
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
  const billingActive = localStatus === "active" || localStatus === "trialing";
  if (isLicenseDevAutoTrialEnabled(env)) {
    return {
      billingStatus: billingActive ? localStatus : "trialing",
      check: null as LicenseCheck | null
    };
  }

  const client = createLicenseApiClient(env);
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
  const primaryEmailVerified = Boolean(
    (user as { primaryEmailVerified?: boolean }).primaryEmailVerified
  );
  const superAdmin = isSuperAdminEmail(email, env);
  const memberships = await listMembershipsForSubject(db, subject);
  const crmUserBySubject = memberships[0]
    ?? await findCrmUserBySubject(db, subject);
  // Super Admins may predate subject-bound CRM provisioning. If their verified
  // platform email already belongs to an active CRM membership, use that
  // membership as the default workspace rather than forcing a blank console.
  const emailMembership = superAdmin && email ? await findCrmUserByEmail(db, email) : null;
  const crmUser = crmUserBySubject ?? emailMembership;
  const requestedWorkspaceId = getRequestedWorkspaceId(requestLike.headers);
  const workspaces = toWorkspaceSummaries(memberships);

  // A platform super admin must explicitly choose a workspace. The database
  // lookup below is the authorization boundary; an arbitrary client-supplied
  // ID never becomes an organization context on its own. Missing, stale, or
  // invalid context deliberately returns the admin-console setup state.
  if (superAdmin) {
    if (requestedWorkspaceId) {
      const workspace = await getOrganizationById(db, requestedWorkspaceId);
      if (workspace) {
        const billing = await getOrganizationBilling(db, workspace.id);
        // Prefer membership in the selected workspace from the multi-membership
        // list; fall back to email-linked membership for pre-provisioned admins.
        const listedMember = memberships.find((row) => row.organizationId === workspace.id && row.active);
        const workspaceMember = listedMember ?? resolveSuperAdminWorkspaceMembership({
          workspaceId: workspace.id,
          subjectMembership: crmUserBySubject,
          emailMembership
        });
        return {
          type: "user",
          id: workspaceMember?.id ?? subject,
          organizationId: workspace.id,
          role: workspaceMember ? (normalizeRole(workspaceMember.role) ?? "admin") : "admin",
          email: workspaceMember?.email ?? email,
          displayName: workspaceMember?.displayName ?? displayName,
          needsSetup: false,
          isSuperAdmin: true,
          hexclaveSubject: subject,
          primaryEmailVerified,
          organizationName: workspace.name,
          workspaceKind: workspace.workspaceKind === "personal" ? "personal" : "company",
          regionCode: workspace.residencyRegion as RegionCode,
          countryCode: workspaceMember?.countryCode ?? null,
          billingStatus: billing?.status ?? "pending",
          workspaces
        };
      }
    }
    const selected = selectMembershipForRequest(memberships, undefined);
    if (selected || (crmUser && "active" in crmUser && crmUser.active)) {
      const activeMembership = selected ?? (crmUser as SubjectMembershipRow | typeof crmUser);
      const organizationId = "organizationId" in activeMembership
        ? activeMembership.organizationId
        : null;
      if (organizationId) {
        const organization = "organizationName" in activeMembership && activeMembership.organizationName
          ? {
              name: activeMembership.organizationName,
              residencyRegion: "residencyRegion" in activeMembership
                ? String(activeMembership.residencyRegion)
                : null,
              workspaceKind: "workspaceKind" in activeMembership
                ? String(activeMembership.workspaceKind)
                : "company"
            }
          : await getOrganizationById(db, organizationId);
        const billing = await getOrganizationBilling(db, organizationId);
        return {
          type: "user",
          id: activeMembership.id,
          organizationId,
          role: normalizeRole(activeMembership.role) ?? "admin",
          email: activeMembership.email ?? email,
          displayName: activeMembership.displayName ?? displayName,
          needsSetup: false,
          isSuperAdmin: true,
          hexclaveSubject: subject,
          primaryEmailVerified,
          organizationName: organization && "name" in organization ? organization.name : null,
          workspaceKind: organization && "workspaceKind" in organization && organization.workspaceKind === "personal"
            ? "personal"
            : "company",
          regionCode: (organization && "residencyRegion" in organization
            ? organization.residencyRegion as RegionCode
            : null),
          countryCode: activeMembership.countryCode ?? null,
          billingStatus: billing?.status ?? "pending",
          workspaces
        };
      }
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
      primaryEmailVerified,
      organizationName: null,
      workspaceKind: null,
      workspaces
    };
  }

  const selectedMembership = selectMembershipForRequest(memberships, requestedWorkspaceId);
  if (!selectedMembership) {
    return {
      type: "user",
      id: subject,
      organizationId: null,
      role: undefined,
      email,
      displayName,
      needsSetup: true,
      isSuperAdmin: false,
      hexclaveSubject: subject,
      primaryEmailVerified,
      organizationName: null,
      workspaceKind: null,
      workspaces: []
    };
  }

  const billing = await getOrganizationBilling(db, selectedMembership.organizationId);
  const license = await checkOrganizationLicense(db, env, {
    organizationId: selectedMembership.organizationId,
    userId: selectedMembership.id,
    subject,
    email: selectedMembership.email ?? email
  }, billing?.status ?? "pending");

  return {
    type: "user",
    id: selectedMembership.id,
    organizationId: selectedMembership.organizationId,
    role: normalizeRole(selectedMembership.role) ?? "member",
    email: selectedMembership.email ?? email,
    displayName: selectedMembership.displayName ?? displayName,
    needsSetup: false,
    isSuperAdmin: false,
    hexclaveSubject: subject,
    primaryEmailVerified,
    organizationName: selectedMembership.organizationName,
    workspaceKind: selectedMembership.workspaceKind === "personal" ? "personal" : "company",
    regionCode: selectedMembership.residencyRegion as RegionCode,
    countryCode: selectedMembership.countryCode ?? null,
    billingStatus: license.billingStatus,
    licenseDecision: license.check?.decision,
    licenseReasonCode: license.check?.reasonCode,
    licenseStatus: license.check?.licenseStatus,
    workspaces
  };
}
