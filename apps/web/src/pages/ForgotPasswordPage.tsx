import { useHexclaveApp } from "@hexclave/react";
import { FormEvent, useState } from "react";
import { Link } from "react-router";
import { Brand } from "../components/Brand";

export function ForgotPasswordPage() {
  const app = useHexclaveApp();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await app.sendForgotPasswordEmail(trimmedEmail);
      if (result.status === "error") {
        setError(result.error.message || "Could not send reset email.");
        return;
      }
      setMessage("If an account exists for that email, a password reset link is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
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
            <p className="eyebrow">Password reset</p>
            <h1>Reset your password</h1>
            <p className="muted">
              Remember your password? <Link to="/sign-in">Sign in</Link>
            </p>
          </div>
          {error ? <div className="banner error">{error}</div> : null}
          {message ? <div className="banner info">{message}</div> : null}
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
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send reset email"}
          </button>
        </form>
      </div>
    </div>
  );
}
