import { useUser } from "@hexclave/react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Brand } from "../components/Brand";

type InvitePreview = {
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
};

export function AcceptInvitePage() {
  const user = useUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenFromUrl = params.get("token") ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!user || !token) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    api(`/api/v1/invitations/${encodeURIComponent(token)}`)
      .then((res) => {
        if (!cancelled) setPreview(res.data as InvitePreview);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Invalid invitation");
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  async function onAccept(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError("Invitation token is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() })
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invitation.");
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
        <form className="stack-form" onSubmit={onAccept}>
          <div>
            <p className="eyebrow">Invitation</p>
            <h1>Join a company</h1>
            <p className="muted">
              {preview
                ? `You're invited to ${preview.organizationName} as ${preview.role}.`
                : "Accept an email invitation to join a Twiniti Loop company."}
            </p>
          </div>
          {error ? <div className="banner error">{error}</div> : null}
          {!user ? (
            <div className="banner info">
              <Link to={`/sign-in?after=${encodeURIComponent(`/accept-invite?token=${token}`)}`}>Sign in</Link>
              {" "}or{" "}
              <Link to="/sign-up">sign up</Link> first, then return here to accept.
            </div>
          ) : null}
          <label>
            Invite token
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste invite token"
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy || !user}>
            {busy ? "Joining…" : "Accept invitation"}
          </button>
        </form>
      </div>
    </div>
  );
}
