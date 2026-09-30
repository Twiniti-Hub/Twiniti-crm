import type { FastifyRequest } from "fastify";
import type { AppEnv } from "@twiniti/config";
import type { FastifyCorsOptions } from "@fastify/cors";

/** Browser origins allowed to call public marketing form endpoints cross-origin. */
export const PUBLIC_FORM_MARKETING_ORIGINS = [
  "https://www-dev-zce9.onrender.com",
  "https://twiniti.ai",
  "https://www.twiniti.ai"
] as const;

const CRM_CORS_HEADERS = ["Content-Type", "Authorization", "X-Twiniti-Workspace-Id"] as const;

function normalizedWebOrigins(env: AppEnv): string[] {
  return env.WEB_ORIGIN
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function isPublicFormCorsRoute(pathname: string): boolean {
  return /^\/api\/v1\/public\/forms\/[^/]+(?:\/submit)?$/.test(pathname);
}

export function allowedCorsOriginsForPath(pathname: string, env: AppEnv): string[] {
  const webOrigins = normalizedWebOrigins(env);
  if (!isPublicFormCorsRoute(pathname)) {
    return webOrigins;
  }
  return [...webOrigins, ...PUBLIC_FORM_MARKETING_ORIGINS];
}

export function resolvePublicFormCorsOptions(
  request: FastifyRequest,
  env: AppEnv
): FastifyCorsOptions {
  const pathname = request.url.split("?")[0] ?? request.url;
  return {
    origin: allowedCorsOriginsForPath(pathname, env),
    credentials: true,
    allowedHeaders: [...CRM_CORS_HEADERS]
  };
}
