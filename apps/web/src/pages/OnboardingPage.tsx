import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, setWorkspaceContextId } from "../lib/api";
import { Brand } from "../components/Brand";
import { CountrySelect } from "../components/CountrySelect";

type WorkspaceChoice = "personal" | "organization";

export function OnboardingPage() {
  const navigate = useNavigate();
  const [workspaceChoice, setWorkspaceChoice] = useState<WorkspaceChoice>("organization");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const isPersonal = workspaceChoice === "personal";
    const name = isPersonal
      ? (displayName.trim() ? `Personal — ${displayName.trim()}` : "")
      : companyName.trim();
    if (!name) {
      setError(isPersonal ? "Display name is required." : "Company name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const organization = await api("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({
          name,
          countryCode,
          joinAsAdmin: true,
          workspaceKind: isPersonal ? "personal" : "company"
        })
      });
      if (organization.data.id) {
        setWorkspaceContextId(organization.data.id);
      }
      if (organization.data.checkoutUrl) {
        window.location.assign(organization.data.checkoutUrl);
      } else {
        navigate("/billing", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace.");
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
            <h1>Choose your workspace</h1>
            <p className="muted">Create a personal CRM or a company workspace to continue.</p>
          </div>
          {error ? <div className="banner error">{error}</div> : null}
          <fieldset className="workspace-choice">
            <legend>Workspace type</legend>
            <label className="workspace-choice-option">
              <input
                type="radio"
                name="workspaceChoice"
                value="personal"
                checked={workspaceChoice === "personal"}
                onChange={() => setWorkspaceChoice("personal")}
              />
              <span>
                <strong>Personal</strong>
                <span className="muted"> Private CRM for you.</span>
              </span>
            </label>
            <label className="workspace-choice-option">
              <input
                type="radio"
                name="workspaceChoice"
                value="organization"
                checked={workspaceChoice === "organization"}
                onChange={() => setWorkspaceChoice("organization")}
              />
              <span>
                <strong>Organization</strong>
                <span className="muted"> Company workspace with members.</span>
              </span>
            </label>
          </fieldset>
          <label>
            Country
            <CountrySelect value={countryCode} onChange={setCountryCode} />
          </label>
          {workspaceChoice === "personal" ? (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe"
                required
                autoComplete="name"
              />
            </label>
          ) : (
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
          )}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : workspaceChoice === "personal" ? "Create personal workspace" : "Create company"}
          </button>
          <p className="muted">
            Have an invite? <Link to="/accept-invite">Accept invitation</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
