import { HexclaveServerApp } from "@hexclave/js";
import type { AppEnv } from "@twiniti/config";
import {
  ensureBootstrapOrg,
  findAgentByCredentialHash,
  findOrCreateCrmUser,
  hashCredential,
  touchAgent,
  type Db
} from "@twiniti/db";

export type AuthActor = {
  type: "user" | "agent" | "system";
  id: string;
  organizationId: string;
  role?: string;
  scopes?: string[];
  email?: string | null;
  displayName?: string | null;
};

export type CrmRole = "viewer" | "analyst" | "marketer" | "admin" | "owner";

export const ROLE_RANK: Record<CrmRole, number> = {
  viewer: 1,
  analyst: 2,
  marketer: 3,
  admin: 4,
  owner: 5
};

export type RequestLike = {
  headers:
    | { get(name: string): string | null | undefined }
    | Record<string, string | string[] | null | undefined>;
};

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

function roleRank(role: string | undefined): number {
  if (!role) return 0;
  return ROLE_RANK[role as CrmRole] ?? 0;
}

export function requireRole(actor: AuthActor, minRole: CrmRole): boolean {
  return roleRank(actor.role) >= ROLE_RANK[minRole];
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
    defaultRole: "owner"
  });
  return {
    type: "user",
    id: user.id,
    organizationId: user.organizationId,
    role: user.role || "owner",
    email: user.email,
    displayName: user.displayName
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
    return {
      type: "agent",
      id: agent.id,
      organizationId: agent.organizationId,
      scopes: parseScopes(agent.scopes),
      displayName: agent.name
    };
  }

  const bootstrapMode = env.AUTH_DISABLED || !env.HEXCLAVE_SECRET_SERVER_KEY;
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

  const org = await ensureBootstrapOrg(db, {
    orgName: env.BOOTSTRAP_ORG_NAME,
    ownerSubject: env.BOOTSTRAP_OWNER_SUBJECT || undefined
  });
  const crmUser = await findOrCreateCrmUser(db, {
    organizationId: org.id,
    subject,
    email,
    displayName,
    defaultRole: "marketer"
  });

  return {
    type: "user",
    id: crmUser.id,
    organizationId: crmUser.organizationId,
    role: crmUser.role,
    email: crmUser.email,
    displayName: crmUser.displayName
  };
}
