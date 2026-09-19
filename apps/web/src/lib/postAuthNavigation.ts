/** Mirrors `apps/router/src/surface.ts` so the browser can detect Hexclave sessions. */
const SESSION_COOKIE_PREFIX =
  /(?:^|;\s*)(?:__Host-)?(?:hexclave-refresh-|stack-refresh-)[^=]*=/;

/** App-only path on the canonical Loop hostname (router always proxies this to CRM). */
export const POST_AUTH_APP_PATH = "/overview";

export function hasHexclaveSessionCookie(cookieHeader: string): boolean {
  return SESSION_COOKIE_PREFIX.test(cookieHeader);
}

export function markAppSurfaceCookie(): void {
  document.cookie = "twiniti_surface=app; Path=/; Secure; SameSite=Lax";
}

export async function waitForHexclaveSessionCookie(timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (hasHexclaveSessionCookie(document.cookie)) return;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("Hexclave session cookie was not written before post-login navigation.");
}

/**
 * Same-origin relative path only; reject protocol-relative open redirects.
 * Map `/` to an app surface so canonical Loop routing does not return marketing.
 */
export function safeAfterSignInPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return POST_AUTH_APP_PATH;
  }
  if (value === "/") return POST_AUTH_APP_PATH;
  return value;
}

export async function navigateAfterCredentialSignIn(path: string): Promise<void> {
  await waitForHexclaveSessionCookie();
  markAppSurfaceCookie();
  window.location.replace(path);
}
