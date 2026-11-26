/**
 * Anonymous app-shell paths that return the SPA index document. Any other path
 * for a guest receives HTTP 404 so soft-404 marketing URLs are not indexed.
 */
const GUEST_SPA_EXACT = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/pricing",
  "/forgot-password",
  "/accept-invite",
  "/logout"
]);

export function normalizeDocumentPath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

export function isGuestSpaDocumentPath(pathname: string) {
  return GUEST_SPA_EXACT.has(normalizeDocumentPath(pathname));
}

export function isHandlerDocumentPath(pathname: string) {
  return pathname === "/handler" || pathname.startsWith("/handler/");
}