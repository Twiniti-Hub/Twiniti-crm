export function isSignOutPath(path: string): boolean {
  return ["/logout", "/sign-out", "/signout", "/handler/sign-out"].includes(path.replace(/\/$/, ""));
}

const SESSION_COOKIE_PREFIX =
  /(?:^|;\s*)(?:__Host-)?(?:hexclave-refresh-|stack-refresh-)[^=]*=/;

export function hasHexclaveSessionCookie(cookieHeader = typeof document !== "undefined" ? document.cookie : "") {
  if (!cookieHeader) return false;
  return SESSION_COOKIE_PREFIX.test(cookieHeader);
}
