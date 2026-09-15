import { useHexclaveApp } from "@hexclave/react";
import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Brand } from "../components/Brand";

/** Same-origin relative path only; reject protocol-relative open redirects. */
function safeAfterPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}

export function SignInPage() {
  const app = useHexclaveApp();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!app) {
      setError("Authentication is not configured.");
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await app.signInWithCredential({
        email: trimmedEmail,
        password,
        noRedirect: true
      });
      if (result.status === "error") {
        setError(result.error.message || "Sign-in failed.");
        return;
      }
      // Full navigation so the Loop router re-resolves `/` with the new Hexclave
      // session cookie and serves the CRM app instead of the marketing site.
      window.location.replace(safeAfterPath(searchParams.get("after")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page-header">
        <Brand link />
      </div>
      <div className="auth-form-wrap">
        <form className="stack-form" onSubmit={onSubmit}>
          <div>
            <p className="eyebrow">Sign in</p>
            <h1>Welcome back</h1>
            <p className="muted">
              Don&apos;t have an account? <Link to="/sign-up">Sign up</Link>
            </p>
          </div>
          {error ? <div className="banner error">{error}</div> : null}
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <p className="muted" style={{ margin: 0 }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
