import type { Me } from "./me";

/** Callback tokens must be consumed before any workspace or billing redirects. */
export function authFlowStage(pathname: string, me: Me | null) {
  if (pathname === "/handler" || pathname.startsWith("/handler/")) return "callback";
  if (me?.primaryEmailVerified === false) return "verification";
  if (me?.needsSetup) return "setup";
  return "workspace";
}
