import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Me } from "../lib/me";
import { authConfigured } from "../hexclave/client";
import { buildResendWebhookUrl } from "../lib/resendWebhookUrl";

type Member = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  active: boolean;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  inviteUrl?: string;
  sent?: boolean;
};

type TrackingAddress = { address: string; domain: string; resendDomainId?: string };
type ResendDomain = { id: string; domain: string; fromEmail: string; fromName: string | null; verificationStatus: string; isDefault: boolean; active: boolean; webhookSecretConfigured?: boolean };

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trackingAddress, setTrackingAddress] = useState<TrackingAddress | null>(null);
  const [trackingResendRequired, setTrackingResendRequired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);
  const [resendDomains, setResendDomains] = useState<ResendDomain[]>([]);
  const [resendDomain, setResendDomain] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendFromEmail, setResendFromEmail] = useState("");
  const [resendFromName, setResendFromName] = useState("");
  const [resendWebhookSecret, setResendWebhookSecret] = useState("");
  const [addResendAsDefault, setAddResendAsDefault] = useState(false);
  const [editingResendId, setEditingResendId] = useState<string | null>(null);
  const [editFromEmail, setEditFromEmail] = useState("");
  const [editFromName, setEditFromName] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editWebhookSecret, setEditWebhookSecret] = useState("");
  const [pendingDeleteResendId, setPendingDeleteResendId] = useState<string | null>(null);

  const isAdmin = me?.role === "admin" || me?.isSuperAdmin === true;

  async function refresh() {
    const meRes = await api("/api/v1/me");
    const nextMe = meRes.data as Me;
    setMe(nextMe);
    if (!nextMe.organizationId) return;
    try {
      const trackingRes = await api("/api/v1/email/tracking-address");
      setTrackingAddress(trackingRes.data as TrackingAddress);
      setTrackingResendRequired(false);
    } catch {
      setTrackingAddress(null);
      setTrackingResendRequired(true);
    }
    const membersRes = await api("/api/v1/organization/members");
    setMembers(membersRes.data as Member[]);
    if (nextMe.role === "admin") {
      const invitesRes = await api("/api/v1/organization/invitations");
      setInvitations(invitesRes.data as Invitation[]);
      const resendRes = await api("/api/v1/organization/integrations/resend/domains");
      setResendDomains(resendRes.data as ResendDomain[]);
    }
  }

  async function addResendDomain(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      await api("/api/v1/organization/integrations/resend/domains", {
        method: "POST",
        body: JSON.stringify({
          domain: resendDomain,
          apiKey: resendApiKey,
          webhookSecret: resendWebhookSecret || undefined,
          fromEmail: resendFromEmail,
          fromName: resendFromName || undefined,
          isDefault: resendDomains.length === 0 || addResendAsDefault
        })
      });
      setResendDomain(""); setResendApiKey(""); setResendWebhookSecret(""); setResendFromEmail(""); setResendFromName(""); setAddResendAsDefault(false);
      setMessage("Resend domain connected.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect Resend domain"); } finally { setBusy(false); }
  }

  function startEditResendDomain(domain: ResendDomain) {
    setEditingResendId(domain.id);
    setEditFromEmail(domain.fromEmail);
    setEditFromName(domain.fromName ?? "");
    setEditApiKey("");
    setEditWebhookSecret("");
    setError(null);
    setMessage(null);
  }

  function cancelEditResendDomain() {
    setEditingResendId(null);
    setEditFromEmail("");
    setEditFromName("");
    setEditApiKey("");
    setEditWebhookSecret("");
  }

  async function saveResendDomain(event: FormEvent) {
    event.preventDefault();
    if (!editingResendId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await api(`/api/v1/organization/integrations/resend/domains/${editingResendId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fromEmail: editFromEmail,
          fromName: editFromName || null,
          apiKey: editApiKey || undefined,
          webhookSecret: editWebhookSecret || undefined
        })
      });
      cancelEditResendDomain();
      setMessage("Resend domain updated.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Resend domain");
    } finally {
      setBusy(false);
    }
  }

  async function deleteResendDomain(id: string, domain: string) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await api(`/api/v1/organization/integrations/resend/domains/${id}`, { method: "DELETE" });
      if (editingResendId === id) cancelEditResendDomain();
      if (pendingDeleteResendId === id) setPendingDeleteResendId(null);
      setMessage(`Removed ${domain}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove Resend domain");
    } finally {
      setBusy(false);
    }
  }

  async function makeDefaultResendDomain(id: string) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await api(`/api/v1/organization/integrations/resend/domains/${id}/default`, {
        method: "POST",
        body: "{}"
      });
      setMessage("Default Resend domain updated. BCC tracking uses the default domain.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select default domain");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"));
  }, []);

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api("/api/v1/organization/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole })
      });
      const invite = res.data as Invitation;
      setInviteEmail("");
      setMessage(
        invite.sent
          ? `Invitation sent to ${invite.email}.`
          : `Invitation created. Share this link: ${invite.inviteUrl ?? "(check server logs)"}`
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(memberId: string, role: "admin" | "member") {
    setError(null);
    try {
      await api(`/api/v1/organization/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role })
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update member");
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Settings</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner info">{message}</div> : null}

      <section className="panel">
        <p className="eyebrow">Company</p>
        <h3>{me?.organizationName ?? "No company"}</h3>
        <p className="muted">
          Signed in as {me?.email ?? "unknown"} · Role: {me?.role ?? "none"}
          {me?.isSuperAdmin ? " · Super Admin" : ""}
        </p>
      </section>

      <section className="panel" style={{ marginTop: 15 }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">People</p>
            <h3>Members</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                {isAdmin ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.displayName ?? "—"}</td>
                  <td>{member.email ?? "—"}</td>
                  <td>{member.role === "admin" ? "Company Admin" : "Member"}</td>
                  {isAdmin ? (
                    <td className="row-actions">
                      {member.role !== "admin" ? (
                        <button className="secondary" type="button" onClick={() => onRoleChange(member.id, "admin")}>
                          Make admin
                        </button>
                      ) : (
                        <button className="secondary" type="button" onClick={() => onRoleChange(member.id, "member")}>
                          Make member
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 15 }}>
        <p className="eyebrow">Email tracking</p>
        <h3>Personal BCC address</h3>
        <p className="muted">
          BCC this address on an email and Loop will match the recipients or sender to contacts and add the message to their timeline.
        </p>
        {trackingAddress ? (
          <div className="form-row" style={{ alignItems: "end" }}>
            <label style={{ flex: 1 }}>
              Tracking address
              <input readOnly value={trackingAddress.address} />
            </label>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(trackingAddress.address);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
        ) : trackingResendRequired ? (
          <p className="muted">
            {isAdmin
              ? "Connect a verified Resend domain in Email delivery below to enable your personal BCC tracking address. Configure receiving (MX records) and paste the full webhook URL from Email delivery into Resend."
              : "Email tracking is unavailable until a company admin connects a verified Resend domain in Email delivery."}
          </p>
        ) : (
          <p className="muted">Tracking address unavailable until the email tracking migration is applied.</p>
        )}
      </section>

      {isAdmin ? (
        <section className="panel" style={{ marginTop: 15 }}>
          <p className="eyebrow">Email delivery</p>
          <h3>Resend domains</h3>
          <p className="muted">
            Connect verified Resend domains for this organization. Each domain uses its own API key.
            BCC tracking and campaign sending use the <strong>default</strong> domain.
            Paste the full webhook URL into Resend (not the Loop homepage). Save the matching signing secret here.
          </p>
          {resendDomains.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>From</th>
                    <th>Status</th>
                    <th>Default</th>
                    <th>Webhook URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {resendDomains.map((domain) => (
                    <tr key={domain.id}>
                      <td><strong>{domain.domain}</strong></td>
                      <td>{domain.fromName ? `${domain.fromName} <${domain.fromEmail}>` : domain.fromEmail}</td>
                      <td>{domain.verificationStatus}</td>
                      <td>{domain.isDefault ? "Yes" : "—"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 360 }}>
                          <code style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                            {buildResendWebhookUrl(domain.domain, API_BASE, window.location.origin)}
                          </code>
                          <div className="row-actions">
                            <button
                              className="secondary"
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(buildResendWebhookUrl(domain.domain, API_BASE, window.location.origin));
                                setCopiedWebhook(domain.id);
                                window.setTimeout(() => setCopiedWebhook(null), 1600);
                              }}
                            >
                              {copiedWebhook === domain.id ? "Copied" : "Copy URL"}
                            </button>
                          </div>
                          {domain.webhookSecretConfigured === false ? (
                            <span className="muted">Webhook secret missing — Edit and save the Resend signing secret or events will be rejected.</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="row-actions">
                        <button className="secondary" type="button" disabled={busy} onClick={() => startEditResendDomain(domain)}>Edit</button>
                        {!domain.isDefault ? (
                          <button className="secondary" type="button" disabled={busy} onClick={() => void makeDefaultResendDomain(domain.id)}>
                            {busy ? "Updating…" : "Make default"}
                          </button>
                        ) : null}
                        {!domain.isDefault ? (
                          pendingDeleteResendId === domain.id ? (
                            <>
                              <button className="primary" type="button" disabled={busy} onClick={() => void deleteResendDomain(domain.id, domain.domain)}>
                                {busy ? "Removing…" : "Confirm remove"}
                              </button>
                              <button className="secondary" type="button" disabled={busy} onClick={() => setPendingDeleteResendId(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="secondary" type="button" disabled={busy} onClick={() => setPendingDeleteResendId(domain.id)}>Remove</button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: 16 }}>No Resend domains connected yet.</p>
          )}
          {editingResendId ? (
            <form className="stack-form" style={{ boxShadow: "none", border: "1px solid var(--border, #ddd)", padding: 16, marginBottom: 16 }} onSubmit={saveResendDomain}>
              <h4 style={{ margin: 0 }}>Edit Resend domain</h4>
              <p className="muted" style={{ marginTop: 8 }}>
                Domain name cannot be changed. Leave API key or webhook secret blank to keep the current value.
              </p>
              <div className="form-row">
                <label style={{ flex: 1 }}>
                  From email
                  <input type="email" value={editFromEmail} onChange={(e) => setEditFromEmail(e.target.value)} required />
                </label>
                <label style={{ flex: 1 }}>
                  From name
                  <input value={editFromName} onChange={(e) => setEditFromName(e.target.value)} placeholder="Twiniti Loop" />
                </label>
              </div>
              <div className="form-row">
                <label style={{ flex: 1 }}>
                  New Resend API key
                  <input type="password" value={editApiKey} onChange={(e) => setEditApiKey(e.target.value)} placeholder="Leave blank to keep current" />
                </label>
                <label style={{ flex: 1 }}>
                  New webhook signing secret
                  <input type="password" value={editWebhookSecret} onChange={(e) => setEditWebhookSecret(e.target.value)} placeholder="Leave blank to keep current" />
                </label>
              </div>
              <div className="form-row">
                <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
                <button className="secondary" type="button" onClick={cancelEditResendDomain}>Cancel</button>
              </div>
            </form>
          ) : null}
          <h4 style={{ marginBottom: 8 }}>Add Resend domain</h4>
          <form className="stack-form" style={{ boxShadow: "none", border: 0, padding: 0 }} onSubmit={addResendDomain}>
            <div className="form-row">
              <label>Domain<input value={resendDomain} onChange={(e) => setResendDomain(e.target.value)} placeholder="mail.example.com" required /></label>
              <label>Resend API key<input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_…" required /></label>
            </div>
            <div className="form-row">
              <label>From email<input type="email" value={resendFromEmail} onChange={(e) => setResendFromEmail(e.target.value)} placeholder="hello@mail.example.com" required /></label>
              <label>From name<input value={resendFromName} onChange={(e) => setResendFromName(e.target.value)} placeholder="Twiniti Loop" /></label>
            </div>
            <label>Webhook signing secret<input type="password" value={resendWebhookSecret} onChange={(e) => setResendWebhookSecret(e.target.value)} placeholder="whsec_…" /></label>
            {resendDomains.length > 0 ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={addResendAsDefault} onChange={(e) => setAddResendAsDefault(e.target.checked)} />
                Make this the default domain
              </label>
            ) : null}
            <button className="primary" type="submit" disabled={busy}>{busy ? "Connecting…" : "Add Resend domain"}</button>
          </form>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="panel" style={{ marginTop: 15 }}>
          <p className="eyebrow">Invites</p>
          <h3>Invite by email</h3>
          <form className="stack-form" style={{ boxShadow: "none", border: 0, padding: 0 }} onSubmit={onInvite}>
            <div className="form-row">
              <label>
                Email
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  placeholder="colleague@company.com"
                />
              </label>
              <label>
                Role
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}>
                  <option value="member">Member</option>
                  <option value="admin">Company Admin</option>
                </select>
              </label>
            </div>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send invite"}
            </button>
          </form>
          {invitations.length > 0 ? (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td>{invite.role}</td>
                      <td>{new Date(invite.expiresAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>No pending invitations.</p>
          )}
        </section>
      ) : null}

      <section className="panel warm" style={{ marginTop: 15 }}>
        <p className="eyebrow">Authentication</p>
        <h3>Hexclave hosted sign-in</h3>
        <p>
          {authConfigured
            ? "You are signed in. Use Sign out in the sidebar to end the session."
            : "Set `VITE_HEXCLAVE_PROJECT_ID` to enable Hexclave sign-in. Until then the API can use bootstrap auth with `AUTH_DISABLED=true`."}
        </p>
      </section>
    </>
  );
}
