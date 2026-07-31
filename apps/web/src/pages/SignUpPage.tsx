import { useHexclaveApp } from "@hexclave/react";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../lib/api";
import { Brand } from "../components/Brand";

export function SignUpPage() {
  const app = useHexclaveApp();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
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
    const name = companyName.trim();
    if (!name) {
      setError("Company name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await app.signUpWithCredential({
        email: email.trim(),
        password,
        noRedirect: true
      });
      if (result.status === "error") {
        const code = (result.error as { errorCode?: string }).errorCode;
        if (code === "USER_EMAIL_ALREADY_EXISTS") {
          setError("An account with this email already exists. Sign in instead.");
        } else if (code === "PASSWORD_REQUIREMENTS_NOT_MET") {
          setError("Password does not meet requirements.");
        } else {
          setError(result.error.message || "Sign-up failed.");
        }
        return;
      }

      const organization = await api("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({ name, joinAsAdmin: true })
      });
      if (organization.data.checkoutUrl) {
        window.location.assign(organization.data.checkoutUrl);
      } else {
        navigate("/billing", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed.");
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
            <p className="eyebrow">Create account</p>
            <h1>Start your company workspace</h1>
            <p className="muted">You'll be the Company Admin for this workspace.</p>
          </div>
          {error ? <div className="banner error">{error}</div> : null}
          <label>
            Company name
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Marketing"
              required
              autoComplete="organization"
            />
          </label>
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
          <p className="muted">
            Already have an account? <Link to="/sign-in">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
