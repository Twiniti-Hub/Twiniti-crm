import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Brand } from "../components/Brand";

export function OnboardingPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = companyName.trim();
    if (!name) {
      setError("Company name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({ name, joinAsAdmin: true })
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create company.");
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
            <p className="eyebrow">Onboarding</p>
            <h1>Name your company</h1>
            <p className="muted">Create your Twiniti Loop workspace to continue.</p>
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
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create company"}
          </button>
          <p className="muted">
            Have an invite? <Link to="/accept-invite">Accept invitation</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
