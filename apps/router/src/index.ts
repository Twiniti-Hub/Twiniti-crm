export interface Env {
  DEFAULT_REGION: string;
  WEB_ORIGIN: string;
  API_ORIGIN_US: string;
  API_ORIGIN_EU: string;
  API_ORIGIN_UK: string;
  WORKSPACE_DIRECTORY: KVNamespace;
}

type Region = "us" | "eu" | "uk";

const regions: Region[] = ["us", "eu", "uk"];

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

async function proxy(request: Request, env: Env, region: Region) {
  const response = await proxyOrigin(request, originFor(env, region));
  return withRouterHeaders(response, request, region);
}

async function discoverWorkspace(request: Request, env: Env) {
  for (const region of regions) {
    const response = await proxy(request, env, region);
    if (!response.ok) continue;
    const body = await response.clone().json().catch(() => null) as { data?: { organizationId?: string; regionCode?: string; isSuperAdmin?: boolean } } | null;
    const organizationId = body?.data?.organizationId;
    const discoveredRegion = isRegion(body?.data?.regionCode ?? null) ? body?.data?.regionCode as Region : region;
    if (organizationId) {
      await env.WORKSPACE_DIRECTORY.put(organizationId, discoveredRegion);
      return response;
    }
    if (body?.data?.isSuperAdmin) return response;
  }
  return proxy(request, env, "us");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "twiniti-loop-router", environment: "development" });
    if (!url.pathname.startsWith("/api/")) return proxyOrigin(request, env.WEB_ORIGIN);

    const workspaceId = request.headers.get("X-Twiniti-Workspace-Id");
    if (!workspaceId && url.pathname === "/api/v1/me") return discoverWorkspace(request, env);
    if (!workspaceId && url.pathname.startsWith("/api/v1/super-admin/")) {
      return proxy(request, env, isRegion(env.DEFAULT_REGION) ? env.DEFAULT_REGION : "us");
    }
    if (!workspaceId) {
      return Response.json({ error: { code: "workspace_context_required", message: "Select a workspace before using this endpoint" } }, { status: 409, headers: corsHeaders(request) });
    }

    const region = await env.WORKSPACE_DIRECTORY.get(workspaceId);
    if (!isRegion(region)) {
      return Response.json({ error: { code: "workspace_region_unknown", message: "Workspace region has not been resolved; refresh your session" } }, { status: 409, headers: corsHeaders(request) });
    }
    return proxy(request, env, region);
  }
};
