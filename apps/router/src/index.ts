import { resolveWebSurface, type Surface } from "./surface";
import { DEV_ROBOTS_TXT, isCrawler, isProduction, wakingPage, wantsDocument } from "./edge";

export interface Env {
  DEFAULT_REGION: string;
  DEPLOYMENT_ENV: string;
  WEB_ORIGIN: string;
  APP_ORIGIN: string;
  API_ORIGIN_US: string;
  API_ORIGIN_EU: string;
  API_ORIGIN_UK: string;
  WORKSPACE_DIRECTORY: KVNamespace;
}

type Region = "us" | "eu" | "uk";

const regions: Region[] = ["us", "eu", "uk"];

/** Mirrors packages/contracts regionForCountry — kept inline so the Worker stays dependency-free. */
const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"
]);

export function regionForCountry(countryCode: string): Region {
  const normalized = countryCode.trim().toUpperCase();
  if (normalized === "GB") return "uk";
  if (EU_COUNTRY_CODES.has(normalized)) return "eu";
  return "us";
}

function originFor(env: Env, region: Region) {
  return ({ us: env.API_ORIGIN_US, eu: env.API_ORIGIN_EU, uk: env.API_ORIGIN_UK })[region];
}

function isRegion(value: string | null): value is Region {
  return value === "us" || value === "eu" || value === "uk";
}

function corsHeaders(request: Request) {
  const headers = new Headers({
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "Authorization, Content-Type, X-Twiniti-Workspace-Id",
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "X-Twiniti-Resolved-Region"
  });
  const origin = request.headers.get("Origin");
  if (origin) headers.set("access-control-allow-origin", origin);
  return headers;
}

function withRouterHeaders(response: Response, request: Request, region: Region) {
  const headers = new Headers(response.headers);
  headers.set("X-Twiniti-Resolved-Region", region);
  for (const [key, value] of corsHeaders(request)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function proxyOrigin(request: Request, origin: string) {
  const target = new URL(request.url);
  target.hostname = new URL(origin).hostname;
  target.protocol = "https:";
  target.port = "";
  target.pathname = target.pathname.replace(/^\/router/, "") || "/";
  const response = await fetch(target, new Request(request, { headers: new Headers(request.headers) }));
  return response;
}

function withSurfaceCookie(response: Response, surface: Surface) {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `twiniti_surface=${surface}; Path=/; Secure; SameSite=Lax`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function proxyWeb(request: Request, env: Env) {
  const url = new URL(request.url);
  const surface = resolveWebSurface(url.pathname, request.headers.get("Cookie"));
  const response = await proxyOrigin(request, surface === "app" ? env.APP_ORIGIN : env.WEB_ORIGIN);
  // The app serves no 429s on document routes; this is Render refusing to wake a sleeping origin.
  if (surface === "app" && response.status === 429 && wantsDocument(request)) {
    return wakingPage([env.APP_ORIGIN, env.API_ORIGIN_US, env.API_ORIGIN_EU, env.API_ORIGIN_UK]);
  }
  const tagged = withSurfaceCookie(response, surface);
  if (!isProduction(env.DEPLOYMENT_ENV)) tagged.headers.set("X-Robots-Tag", "noindex, nofollow");
  return tagged;
}

/** A sleeping free-plan cell answers 429; treat it as unavailable, not as "no workspace here". */
function cellUnavailable(response: Response) {
  return response.status >= 500 || response.status === 429;
}

async function proxy(request: Request, env: Env, region: Region) {
  const response = await proxyOrigin(request, originFor(env, region));
  return withRouterHeaders(response, request, region);
}

/** Bounded parallel reads keep one unhealthy regional cell from hanging sign-in. */
export async function discoverWorkspace(request: Request, env: Env, timeoutMs = 8000) {
  const results = await Promise.all(regions.map(async (region) => {
    try {
      const bounded = new Request(request, { signal: AbortSignal.timeout(timeoutMs) });
      const response = await proxy(bounded, env, region);
      const body = response.ok
        ? await response.clone().json() as { data?: { organizationId?: string; regionCode?: string; isSuperAdmin?: boolean } }
        : null;
      return { region, response, body };
    } catch {
      return null;
    }
  }));
  // Preserve the established US/EU/UK selection order when multiple memberships exist.
  for (const result of results) {
    const organizationId = result?.body?.data?.organizationId;
    if (!result || !organizationId) continue;
    const discoveredRegion = isRegion(result.body?.data?.regionCode ?? null)
      ? result.body!.data!.regionCode as Region : result.region;
    await env.WORKSPACE_DIRECTORY.put(organizationId, discoveredRegion);
    return result.response;
  }
  const admin = results.find((result) => result?.body?.data?.isSuperAdmin);
  if (admin) return admin.response;
  // Do not claim setup is needed when a cell could contain the user's workspace.
  if (results.some((result) => !result || cellUnavailable(result.response))) {
    return Response.json({ error: { code: "workspace_discovery_unavailable", message: "A workspace service is unavailable. Please retry." } },
      { status: 503, headers: corsHeaders(request) });
  }
  return results.find((result) => result?.response.ok)?.response ?? results[0]!.response;
}

/**
 * First-time Personal/Org create has no X-Twiniti-Workspace-Id yet.
 * Route by countryCode → residency region and seed KV from the create response.
 */
export async function proxyBootstrapCreate(request: Request, env: Env) {
  let countryCode = "";
  try {
    const body = await request.clone().json() as { countryCode?: unknown };
    countryCode = typeof body.countryCode === "string" ? body.countryCode : "";
  } catch {
    return Response.json(
      { error: { code: "invalid_body", message: "Request body must be JSON with countryCode" } },
      { status: 400, headers: corsHeaders(request) }
    );
  }
  if (!countryCode.trim()) {
    return Response.json(
      { error: { code: "invalid_body", message: "countryCode is required" } },
      { status: 400, headers: corsHeaders(request) }
    );
  }
  const region = regionForCountry(countryCode);
  const response = await proxy(request, env, region);
  if (response.ok) {
    try {
      const json = await response.clone().json() as { data?: { id?: string; regionCode?: string } };
      const organizationId = json.data?.id;
      if (organizationId) {
        const stored = isRegion(json.data?.regionCode ?? null) ? (json.data!.regionCode as Region) : region;
        await env.WORKSPACE_DIRECTORY.put(organizationId, stored);
      }
    } catch {
      // Regional body shape can vary; create already succeeded.
    }
  }
  return response;
}

/** Invite accept/lookup: no workspace header and no reliable country — fan out like /me. */
export async function proxyBootstrapFanout(request: Request, env: Env, timeoutMs = 8000) {
  const results = await Promise.all(regions.map(async (region) => {
    try {
      const bounded = new Request(request, { signal: AbortSignal.timeout(timeoutMs) });
      const response = await proxy(bounded, env, region);
      return { region, response };
    } catch {
      return null;
    }
  }));
  const hit = results.find((result) => result && result.response.status !== 404 && !cellUnavailable(result.response));
  if (hit) return hit.response;
  if (results.some((result) => !result || cellUnavailable(result.response))) {
    return Response.json(
      { error: { code: "workspace_discovery_unavailable", message: "A workspace service is unavailable. Please retry." } },
      { status: 503, headers: corsHeaders(request) }
    );
  }
  return results.find((result) => result)?.response
    ?? Response.json(
      { error: { code: "workspace_discovery_unavailable", message: "A workspace service is unavailable. Please retry." } },
      { status: 503, headers: corsHeaders(request) }
    );
}

function isInvitationLookup(pathname: string) {
  return /^\/api\/v1\/invitations\/[^/]+$/.test(pathname);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({
      ok: true,
      service: "twiniti-loop-router",
      environment: env.DEPLOYMENT_ENV
    });
    if (!isProduction(env.DEPLOYMENT_ENV)) {
      if (url.pathname === "/robots.txt") {
        return new Response(DEV_ROBOTS_TXT, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
      }
      if (isCrawler(request.headers.get("User-Agent"))) {
        return new Response("Crawling is disabled on this environment.\n", {
          status: 403,
          headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" }
        });
      }
    }
    if (!url.pathname.startsWith("/api/")) return proxyWeb(request, env);

    const workspaceId = request.headers.get("X-Twiniti-Workspace-Id");
    if (!workspaceId && url.pathname === "/api/v1/me") return discoverWorkspace(request, env);
    if (!workspaceId && url.pathname.startsWith("/api/v1/super-admin/")) {
      return proxy(request, env, isRegion(env.DEFAULT_REGION) ? env.DEFAULT_REGION : "us");
    }
    // Pre-workspace bootstrap: onboarding create + invite flows (TWI-1059).
    if (!workspaceId && request.method === "POST" && url.pathname === "/api/v1/organizations") {
      return proxyBootstrapCreate(request, env);
    }
    if (!workspaceId && request.method === "POST" && url.pathname === "/api/v1/invitations/accept") {
      return proxyBootstrapFanout(request, env);
    }
    if (!workspaceId && request.method === "GET" && isInvitationLookup(url.pathname)) {
      return proxyBootstrapFanout(request, env);
    }
    if (!workspaceId) {
      return Response.json({ error: { code: "workspace_context_required", message: "Select a workspace before using this endpoint" } }, { status: 409, headers: corsHeaders(request) });
    }

    const region = await env.WORKSPACE_DIRECTORY.get(workspaceId);
    if (!isRegion(region)) {
      if (url.pathname === "/api/v1/me") return discoverWorkspace(request, env);
      return Response.json({ error: { code: "workspace_region_unknown", message: "Workspace region has not been resolved; refresh your session" } }, { status: 409, headers: corsHeaders(request) });
    }
    return proxy(request, env, region);
  }
};

export { resolveWebSurface, hasHexclaveSessionCookie, cookieValue } from "./surface";
