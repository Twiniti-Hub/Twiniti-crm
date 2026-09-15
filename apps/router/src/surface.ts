/** Marketing paths that must stay on the landing origin for anonymous visitors. */
const ALWAYS_LANDING_PATHS = new Set(["/robots.txt", "/sitemap.xml"]);

/**
 * Hexclave persists refresh tokens under these cookie name prefixes. `__Host-`
 * is preferred on HTTPS; legacy `stack-refresh-` remains readable during SDK
 * migrations. Matching any of them means the browser already has an auth
 * session for this host.
 */
const SESSION_COOKIE_PREFIX =
  /(?:^|;\s*)(?:__Host-)?(?:hexclave-refresh-|stack-refresh-)[^=]*=/;

export type Surface = "landing" | "app";

export function cookieValue(cookieHeader: string | null, name: string): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function hasHexclaveSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return SESSION_COOKIE_PREFIX.test(cookieHeader);
}

/**
 * Decide whether a non-API request should be proxied to the marketing landing
 * site or the CRM app.
 *
 * Critical cases:
 * - `/` after sign-in is Hexclave's configured afterSignIn/home target. If we
 *   always send `/` to the landing site, a successful login full-navigation
 *   shows the marketing page and a second Sign in prompt.
 * - `/branding/*` is shared by both builds. Forcing it onto the landing surface
 *   overwrites `twiniti_surface=app` and makes later `/assets/*` fetches miss
 *   the app bundle (404 on the landing origin).
 */
export function resolveWebSurface(pathname: string, cookieHeader: string | null): Surface {
  if (ALWAYS_LANDING_PATHS.has(pathname)) return "landing";

  const surfaceCookie = cookieValue(cookieHeader, "twiniti_surface");
  const signedIn = hasHexclaveSessionCookie(cookieHeader);
  const preferApp = signedIn || surfaceCookie === "app";

  if (pathname === "/") {
    return signedIn ? "app" : "landing";
  }

  if (pathname.startsWith("/branding/") || pathname.startsWith("/assets/")) {
    return preferApp ? "app" : "landing";
  }

  return "app";
}
