export function isSignOutPath(path: string): boolean {
  return ["/logout", "/sign-out", "/signout", "/handler/sign-out"].includes(path.replace(/\/$/, ""));
}
