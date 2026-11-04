import { useEffect, useRef, useState } from "react";
import { hexclaveApp } from "../hexclave/client";
import { clearWorkspaceContextId, setBrowserAuthorizationHeader } from "../lib/api";

export function SessionExitLink() {
  return <p className="muted"><a href="/logout">Sign out</a></p>;
}

/** Deliberately independent of useUser, /me, and workspace loading. */
export function SessionExit() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    setError(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      clearWorkspaceContextId();
      setBrowserAuthorizationHeader(null);
      await Promise.race([
        hexclaveApp?.signOut({ redirectUrl: "/sign-in" }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Sign-out timed out. Please retry.")), 15_000);
        })
      ]);
      window.location.replace("/sign-in");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out. Please retry.");
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signOut();
  }, []);
  return <div className="auth-page"><div className="auth-form-wrap">
    <h1>Sign out</h1>
    {error ? <div className="banner error" role="alert">{error}</div> : <p>Signing out…</p>}
    {error ? <button disabled={busy} onClick={() => void signOut()}>Retry sign out</button> : null}
  </div></div>;
}
