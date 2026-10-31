import { useHexclaveApp } from "@hexclave/react";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, setWorkspaceContextId } from "../lib/api";
import { Brand } from "../components/Brand";
import { CountrySelect } from "../components/CountrySelect";
import { PAGE_META, usePageMeta } from "../lib/pageMeta";

type WorkspaceChoice = "personal" | "organization";

export function SignUpPage() {
  const app = useHexclaveApp();
  usePageMeta(PAGE_META.signUp.title, PAGE_META.signUp.description);
  const navigate = useNavigate();
  const [workspaceChoice, setWorkspaceChoice] = useState<WorkspaceChoice>("organization");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [countryCode, setCountryCode] = useState("");
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
    const isPersonal = workspaceChoice === "personal";
    const name = isPersonal
      ? (displayName.trim() || "Personal")
      : companyName.trim();
    if (!isPersonal && !name) {
      setError("Company name is required.");
      return;
    }
    if (isPersonal && !displayName.trim()) {
      setError("Display name is required.");
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
        body: JSON.stringify({
          name: isPersonal ? `Personal — ${displayName.trim()}` : name,
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
            <h1>Start your Loop workspace</h1>
            <p className="muted">
              Choose a personal CRM (only you) or an organization workspace for your company.
            </p>
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
                <span className="muted"> Private CRM for you. Full Loop features; no teammates.</span>
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
                <span className="muted"> Company workspace with members and invites.</span>
              </span>
            </label>
          </fieldset>
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
          <label>
            Country
            <CountrySelect value={countryCode} onChange={setCountryCode} />
          </label>
          <label>
            {workspaceChoice === "personal" ? "Email" : "Work email"}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={workspaceChoice === "personal" ? "you@example.com" : "you@company.com"}
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
