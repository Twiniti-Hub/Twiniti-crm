import { LicenseNotice } from "../components/LicenseNotice";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
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
type WebVisitorIntegration = { configured: boolean; enabled: boolean; publicKey: string | null; loaderSnippet: string | null; settings: { createContacts: boolean; createCompanies: boolean }; lastWebhookAt: string | null; webhookToken?: string | null };
type InstallationValidation = { status: "installed" | "missing" | "blocked" | "unreachable" | "timeout" | "too_large" | "non_html"; hostname: string; message: string };
type ContactSyncConnection = {
  id: string;
  provider: "google" | "icloud";
  accountLabel: string;
  status: string;
  selectedScope: string[];
  generation: number;
  previewRevision: number;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};
type ContactSyncPerson = {
  id: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emails?: Array<{ value: string; primary?: boolean }>;
  phones?: Array<{ value: string; primary?: boolean }>;
};
type ContactSyncPreview = { count: number; sample: ContactSyncPerson[] };
type ContactSyncConflict = { id: string; source: ContactSyncPerson };

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
  const [webVisitors, setWebVisitors] = useState<WebVisitorIntegration | null>(null);
  const [webVisitorPublicKey, setWebVisitorPublicKey] = useState("");
  const [webVisitorEnabled, setWebVisitorEnabled] = useState(false);
  const [webVisitorCreateContacts, setWebVisitorCreateContacts] = useState(false);
  const [webVisitorCreateCompanies, setWebVisitorCreateCompanies] = useState(true);
  const [webVisitorToken, setWebVisitorToken] = useState<string | null>(null);
  const [installationOpen, setInstallationOpen] = useState(false);
  const [installationUrl, setInstallationUrl] = useState("");
  const [installationResult, setInstallationResult] = useState<InstallationValidation | null>(null);
  const [installationBusy, setInstallationBusy] = useState(false);
  const [loaderCopied, setLoaderCopied] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [replaceWebsiteKey, setReplaceWebsiteKey] = useState(false);
  const [confirmWebhookRotation, setConfirmWebhookRotation] = useState(false);
  const [contactConnections, setContactConnections] = useState<ContactSyncConnection[]>([]);
  const [contactPreviews, setContactPreviews] = useState<Record<string, ContactSyncPreview>>({});
  const [contactConflicts, setContactConflicts] = useState<Record<string, ContactSyncConflict[]>>({});
  const [icloudAccount, setIcloudAccount] = useState("");
  const [icloudPassword, setIcloudPassword] = useState("");

  const isAdmin = me?.role === "admin" || me?.isSuperAdmin === true;
  const isPersonalWorkspace = me?.workspaceKind === "personal";

  async function refresh() {
    const meRes = await api("/api/v1/me");
    const nextMe = meRes.data as Me;
    setMe(nextMe);
    if (!nextMe.organizationId) return;
    // Load WV App independently: a failure in invitations/email must not hide installation.
    if (nextMe.role === "admin" || nextMe.isSuperAdmin) {
      try {
        const result = await api("/api/v1/organization/integrations/web-visitors");
        const integration = result.data as WebVisitorIntegration;
        setWebVisitors(integration);
        setWebVisitorToken(integration.webhookToken ?? null);
        setWebVisitorPublicKey(integration.publicKey ?? "");
        setWebVisitorEnabled(integration.enabled);
        setWebVisitorCreateContacts(integration.settings.createContacts);
        setWebVisitorCreateCompanies(integration.settings.createCompanies);
      } catch (err) { setError(err instanceof Error ? err.message : "Could not load Web Visitors settings"); }
    }
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
    if (nextMe.workspaceKind === "personal" && nextMe.role === "admin") {
      try {
        const connectionsRes = await api("/api/v1/personal/contact-connections");
        const connections = connectionsRes.data as ContactSyncConnection[];
        setContactConnections(connections);
        const previewEntries = await Promise.all(connections
          .filter((connection) => connection.status === "preview_ready")
          .map(async (connection) => {
            const result = await api(`/api/v1/personal/contact-connections/${connection.id}/preview`);
            return [connection.id, { count: Number(result.data.count), sample: result.data.sample as ContactSyncPerson[] }] as const;
          }));
        setContactPreviews(Object.fromEntries(previewEntries));
        const conflictEntries = await Promise.all(connections
          .filter((connection) => connection.status === "connected" || connection.status === "error")
          .map(async (connection) => {
            const result = await api(`/api/v1/personal/contact-connections/${connection.id}/conflicts`);
            return [connection.id, result.data as ContactSyncConflict[]] as const;
          }));
        setContactConflicts(Object.fromEntries(conflictEntries));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load connected contact accounts");
      }
    } else {
      setContactConnections([]);
    }
    if (nextMe.role === "admin") {
      if (nextMe.workspaceKind !== "personal") {
        const invitesRes = await api("/api/v1/organization/invitations");
        setInvitations(invitesRes.data as Invitation[]);
      } else {
        setInvitations([]);
      }
      const resendRes = await api("/api/v1/organization/integrations/resend/domains");
      setResendDomains(resendRes.data as ResendDomain[]);
    }
  }

  async function saveWebVisitors(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      const res = await api("/api/v1/organization/integrations/web-visitors", { method: "PUT", body: JSON.stringify({ enabled: webVisitorEnabled, publicKey: webVisitorPublicKey || undefined, settings: { createContacts: webVisitorCreateContacts, createCompanies: webVisitorCreateCompanies } }) });
      const integration = res.data as WebVisitorIntegration;
      setWebVisitors(integration); setWebVisitorPublicKey(integration.publicKey ?? ""); setWebVisitorToken(integration.webhookToken ?? null); setReplaceWebsiteKey(false); setLoaderCopied(false); setInstallationResult(null); setMessage("WV App settings and webhook saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save WV App settings"); } finally { setBusy(false); }
  }

  async function rotateWebVisitorToken() {
    setBusy(true); setError(null); setMessage(null);
    try { const res = await api("/api/v1/organization/integrations/web-visitors/rotate-webhook-token", { method: "POST", body: "{}" }); setWebVisitors(res.data as WebVisitorIntegration); setWebVisitorToken(String(res.data.webhookToken)); setConfirmWebhookRotation(false); setWebhookCopied(false); setMessage("New webhook saved. Update the sender with this URL. Your website code has not changed."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not rotate webhook token"); } finally { setBusy(false); }
  }

  async function copyWebVisitorLoader() {
    if (!webVisitors?.loaderSnippet) return;
    try { await navigator.clipboard.writeText(webVisitors.loaderSnippet); setLoaderCopied(true); window.setTimeout(() => setLoaderCopied(false), 2_000); }
    catch { setError("Could not copy the installation code. Select and copy it manually."); }
  }

  async function validateInstallation(event: FormEvent) {
    event.preventDefault(); setInstallationBusy(true); setInstallationResult(null);
    try {
      const res = await api("/api/v1/organization/integrations/web-visitors/validate-installation", { method: "POST", body: JSON.stringify({ url: installationUrl }) });
      setInstallationResult(res.data as InstallationValidation);
    } catch (err) {
      setInstallationResult({ status: "unreachable", hostname: "", message: err instanceof Error ? err.message : "Could not validate the website." });
    } finally { setInstallationBusy(false); }
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

  async function connectGoogleContacts() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await api("/api/v1/personal/contact-connections/google/authorize", { method: "POST", body: "{}" });
      window.location.assign(String(result.data.authorizationUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Google authorization");
      setBusy(false);
    }
  }

  async function connectIcloudContacts(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      await api("/api/v1/personal/contact-connections/icloud", {
        method: "POST",
        body: JSON.stringify({ account: icloudAccount, appSpecificPassword: icloudPassword })
      });
      setIcloudPassword("");
      setMessage("iCloud connected. Loop is preparing an import preview.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect iCloud Contacts");
    } finally { setBusy(false); }
  }

  async function runContactImport(connection: ContactSyncConnection) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await api(`/api/v1/personal/contact-connections/${connection.id}/import`, {
        method: "POST", body: JSON.stringify({ previewRevision: connection.previewRevision })
      });
      setMessage("Contact import queued. You can leave this page while it runs.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not start contact import"); }
    finally { setBusy(false); }
  }

  async function syncContacts(connection: ContactSyncConnection) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await api(`/api/v1/personal/contact-connections/${connection.id}/sync`, { method: "POST", body: "{}" });
      setMessage("Contact sync queued.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not start contact sync"); }
    finally { setBusy(false); }
  }

  async function resolveContactConflict(connection: ContactSyncConnection, conflict: ContactSyncConflict, action: "create" | "ignore") {
    setBusy(true); setError(null); setMessage(null);
    try {
      await api(`/api/v1/personal/contact-connections/${connection.id}/conflicts/${conflict.id}/resolve`, {
        method: "POST", body: JSON.stringify({ action })
      });
      setMessage(action === "create" ? "Created a separate contact from the provider record." : "Ignored the provider record.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not resolve contact review item"); }
    finally { setBusy(false); }
  }

  async function disconnectContacts(connection: ContactSyncConnection) {
    if (!window.confirm(`Disconnect ${connection.accountLabel}? Imported contacts and Loop history will be retained.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await api(`/api/v1/personal/contact-connections/${connection.id}/disconnect`, {
        method: "POST", body: JSON.stringify({ mode: "retain", generation: connection.generation })
      });
      setMessage("Contact account disconnected. Imported contacts were retained.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not disconnect contact account"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"));
  }, []);

  useEffect(() => {
    if (!installationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setInstallationOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [installationOpen]);

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
      <LicenseNotice />
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner info">{message}</div> : null}

      <section className="panel">
        <p className="eyebrow">{isPersonalWorkspace ? "Personal workspace" : "Company workspace"}</p>
        <h3>{me?.organizationName ?? (isPersonalWorkspace ? "No personal workspace" : "No company")}</h3>
        <p className="muted">
          Signed in as {me?.email ?? "unknown"} · Role: {me?.role ?? "none"}
          {me?.isSuperAdmin ? " · Super Admin" : ""}
          {isPersonalWorkspace ? " · Visible only to you" : ""}
        </p>
      </section>

      {isAdmin && isPersonalWorkspace ? (
        <section className="panel" style={{ marginTop: 15 }}>
          <p className="eyebrow">Personal contacts</p>
          <h3>Connected accounts</h3>
          <p className="muted">Import saved contacts from Google or iCloud and keep them refreshed in this personal workspace. Sync is inbound only; Loop never changes contacts at the provider.</p>
          {contactConnections.length ? (
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead><tr><th>Provider</th><th>Account</th><th>Status</th><th>Last synced</th><th>Actions</th></tr></thead>
                <tbody>
                  {contactConnections.map((connection) => (
                    <tr key={connection.id}>
                      <td>{connection.provider === "google" ? "Google" : "iCloud"}</td>
                      <td>{connection.accountLabel}</td>
                      <td>
                        {connection.status.replaceAll("_", " ")}
                        {contactPreviews[connection.id] ? <div className="muted">{contactPreviews[connection.id].count} contacts ready to review</div> : null}
                        {contactConflicts[connection.id]?.length ? <div className="muted">{contactConflicts[connection.id].length} need review</div> : null}
                        {connection.lastErrorMessage ? <div className="muted">{connection.lastErrorMessage}</div> : null}
                      </td>
                      <td>{connection.lastSuccessAt ? new Date(connection.lastSuccessAt).toLocaleString() : "Not yet"}</td>
                      <td className="row-actions">
                        {connection.status === "preview_ready" ? <button className="primary" type="button" disabled={busy} onClick={() => void runContactImport(connection)}>Import contacts</button> : null}
                        {connection.status === "connected" || connection.status === "error" ? <button className="secondary" type="button" disabled={busy} onClick={() => void syncContacts(connection)}>Sync now</button> : null}
                        <button className="secondary" type="button" disabled={busy} onClick={() => void disconnectContacts(connection)}>Disconnect</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contactConnections.map((connection) => {
                const preview = contactPreviews[connection.id];
                const conflicts = contactConflicts[connection.id] ?? [];
                if (!preview && conflicts.length === 0) return null;
                return (
                  <div key={`${connection.id}-review`} style={{ padding: 12 }}>
                    {preview ? <>
                      <h4>Import preview · {connection.accountLabel}</h4>
                      <p className="muted">Showing {Math.min(preview.sample.length, preview.count)} of {preview.count}. Check the account before importing.</p>
                      <ul>{preview.sample.slice(0, 8).map((person) => <li key={person.id}>{person.displayName || [person.firstName, person.lastName].filter(Boolean).join(" ") || person.emails?.[0]?.value || person.phones?.[0]?.value || "Unnamed contact"}</li>)}</ul>
                    </> : null}
                    {conflicts.length ? <>
                      <h4>Contacts needing review · {connection.accountLabel}</h4>
                      {conflicts.map((conflict) => {
                        const label = conflict.source.displayName || [conflict.source.firstName, conflict.source.lastName].filter(Boolean).join(" ") || conflict.source.emails?.[0]?.value || conflict.source.phones?.[0]?.value || "Unnamed contact";
                        return <div className="form-row" key={conflict.id} style={{ alignItems: "center", marginBottom: 8 }}><span style={{ flex: 1 }}>{label}</span><button className="secondary" type="button" disabled={busy} onClick={() => void resolveContactConflict(connection, conflict, "create")}>Create separate</button><button className="secondary" type="button" disabled={busy} onClick={() => void resolveContactConflict(connection, conflict, "ignore")}>Ignore</button></div>;
                      })}
                    </> : null}
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">No contact accounts connected.</p>}
          {!contactConnections.some((connection) => connection.provider === "google") ? (
            <div className="form-row" style={{ marginBottom: 16 }}>
              <button className="primary" type="button" disabled={busy} onClick={() => void connectGoogleContacts()}>Connect Google Contacts</button>
            </div>
          ) : null}
          {!contactConnections.some((connection) => connection.provider === "icloud") ? (
            <form className="stack-form" style={{ boxShadow: "none", border: 0, padding: 0 }} onSubmit={connectIcloudContacts}>
              <h4>Connect iCloud Contacts</h4>
              <p className="muted">Use your Apple Account email and an app-specific password. Never enter your normal Apple Account password. <a href="https://support.apple.com/en-us/102654" target="_blank" rel="noreferrer">Create an app-specific password</a>.</p>
              <div className="form-row">
                <label style={{ flex: 1 }}>Apple Account email<input type="email" value={icloudAccount} onChange={(event) => setIcloudAccount(event.target.value)} required /></label>
                <label style={{ flex: 1 }}>App-specific password<input type="password" autoComplete="new-password" value={icloudPassword} onChange={(event) => setIcloudPassword(event.target.value)} required /></label>
              </div>
              <div className="form-row"><button className="primary" type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect iCloud Contacts"}</button></div>
            </form>
          ) : null}
        </section>
      ) : null}

      {isAdmin ? (
        <section className="panel" style={{ marginTop: 15 }}>
          <p className="eyebrow">WV App</p><h3>Web Visitors</h3>
          <p className="muted">Identify website visitors and record each unique visit on the matched contact, or on the company when no contact is safely resolved. LinkedIn identifiers are matched only when WV App supplies them; Loop does not scrape LinkedIn.</p>
          <form className="stack-form" style={{ boxShadow: "none", border: 0, padding: 0 }} onSubmit={saveWebVisitors}>
            <label>Website key provisioned by your Org Admin<input value={webVisitorPublicKey} readOnly={Boolean(webVisitors?.publicKey) && !replaceWebsiteKey} onChange={(event) => setWebVisitorPublicKey(event.target.value)} pattern="[A-Za-z0-9_-]{6,100}" placeholder="Enter your organization's website key" /></label>
            {webVisitors?.publicKey && !replaceWebsiteKey ? <button className="secondary" type="button" onClick={() => setReplaceWebsiteKey(true)}>Replace website key</button> : null}
            <label><input type="checkbox" checked={webVisitorEnabled} onChange={(event) => setWebVisitorEnabled(event.target.checked)} /> Enable Web Visitors ingestion</label>
            <label><input type="checkbox" checked={webVisitorCreateCompanies} onChange={(event) => setWebVisitorCreateCompanies(event.target.checked)} /> Create companies for valid unmatched domains</label>
            <label><input type="checkbox" checked={webVisitorCreateContacts} onChange={(event) => setWebVisitorCreateContacts(event.target.checked)} /> Create contacts only when a valid business email is supplied</label>
            <div className="form-row"><button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save organization settings"}</button></div>
          </form>
          <div className="form-row" style={{ marginTop: 12 }}><button className="secondary" type="button" onClick={() => { setInstallationResult(null); setInstallationOpen(true); }}>Install on your website</button></div>
          <p className="muted">Last webhook: {webVisitors?.lastWebhookAt ? new Date(webVisitors.lastWebhookAt).toLocaleString() : "Never"}</p>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: 15 }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">People</p>
            <h3>{isPersonalWorkspace ? "Owner" : "Members"}</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                {isAdmin && !isPersonalWorkspace ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.displayName ?? "—"}</td>
                  <td>{member.email ?? "—"}</td>
                  <td>
                    {isPersonalWorkspace
                      ? "Owner"
                      : member.role === "admin" ? "Company Admin" : "Member"}
                  </td>
                  {isAdmin && !isPersonalWorkspace ? (
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
            In Resend: verify the domain, enable <strong>Receiving</strong> (MX), paste the{" "}
            <strong>exact</strong> webhook URL from this table (including <code>?domain=…</code>),
            subscribe to <code>email.received</code>, then save that webhook’s signing secret (<code>whsec_…</code>) here.
            Do not point Resend at the Loop homepage — a wrong URL or secret returns 401 and BCC emails never log.
            Full checklist: <Link to="/help">Help → Email with Resend</Link>.
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

      {isAdmin && !isPersonalWorkspace ? (
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
      {isAdmin && isPersonalWorkspace ? (
        <section className="panel" style={{ marginTop: 15 }}>
          <p className="eyebrow">Invites</p>
          <h3>Solo workspace</h3>
          <p className="muted">
            Personal workspaces do not support inviting other members.{" "}
            <Link to="/accept-invite">Accept a company invitation</Link> to add an organization workspace alongside this one.
          </p>
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

      {installationOpen && isAdmin ? (
        <div className="side-card-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setInstallationOpen(false); }}>
          <aside className="side-card" role="dialog" aria-modal="true" aria-labelledby="web-visitor-install-title">
            <div className="side-card-header">
              <div><p className="eyebrow">WV App</p><h2 id="web-visitor-install-title">Install Web Visitors</h2></div>
              <button className="secondary" type="button" aria-label="Close installation instructions" onClick={() => setInstallationOpen(false)}>Close</button>
            </div>
            <div className="side-card-body">
              {error ? <p className="banner error" role="alert">{error}</p> : null}
              {message ? <p className="banner info" role="status">{message}</p> : null}
              <section className="wv-setup-step">
                <h3>1. Generate webhook</h3>
                <p>Your webhook is saved for this organization. You can return and copy it at any time.</p>
                {webVisitorToken ? <>
                  <label>Saved webhook URL<input readOnly value={`${API_BASE || window.location.origin}/api/v1/webhooks/web-visitors/${webVisitorToken}`} /></label>
                  <button className="secondary" type="button" onClick={() => void navigator.clipboard.writeText(`${API_BASE || window.location.origin}/api/v1/webhooks/web-visitors/${webVisitorToken}`).then(() => setWebhookCopied(true)).catch(() => setError("Could not copy. Select the webhook URL and copy it manually."))}>{webhookCopied ? "Copied" : "Copy webhook URL"}</button>
                </> : !webVisitors?.configured ? <form onSubmit={saveWebVisitors}><button className="primary" disabled={busy}>Generate and save webhook</button></form> : <p>Your earlier webhook was stored as a one-way hash. Rotate it once to save a URL you can retrieve here.</p>}
                {webVisitors?.configured ? <button className="secondary" type="button" disabled={busy} onClick={() => setConfirmWebhookRotation(true)}>Rotate webhook</button> : null}
                {confirmWebhookRotation ? <div role="alert"><p>Rotation replaces the current webhook immediately. Update your sender with the new URL. Your website key and code stay the same.</p><button className="primary" type="button" disabled={busy} onClick={() => void rotateWebVisitorToken()}>Rotate and save</button><button className="secondary" type="button" onClick={() => setConfirmWebhookRotation(false)}>Cancel</button></div> : null}
              </section>
              <section className="wv-setup-step">
              <h3>2. Install on website</h3>
              <label>Saved website key<input readOnly value={webVisitors?.publicKey ?? ""} placeholder="Provisioned by your Org Admin in organization settings" /></label>
              <p>Add this code to the global template for every public page you want to track. Place it after your consent controls and before the closing <code>&lt;/body&gt;</code> tag, or in your site's global head if that is how scripts are managed.</p>
              {!webVisitors?.publicKey ? <button className="secondary" type="button" onClick={() => setInstallationOpen(false)}>Set up key in organization settings</button> : null}
              </section>
              <section className="wv-setup-step">
              <div className="install-code-heading"><h3>3. Your generated code</h3><button className="secondary" type="button" disabled={!webVisitors?.loaderSnippet} onClick={() => void copyWebVisitorLoader()}>{loaderCopied ? "Copied" : "Copy code"}</button></div>
              <pre className="install-code"><code>{webVisitors?.loaderSnippet ?? "Your installation code will appear here after saving the public key."}</code></pre>
              <ol className="install-steps"><li>Paste the code into your website template.</li><li>Publish the website and clear any site or CDN cache.</li><li>Enter a public page URL below and run the validation test.</li></ol>
              </section>
              <section className="wv-setup-step">
              <h3>4. Validate website</h3>
              <form className="stack-form install-validation" onSubmit={validateInstallation}>
                <label>Public website URL<input type="url" value={installationUrl} onChange={(event) => { setInstallationUrl(event.target.value); setInstallationResult(null); }} placeholder="https://www.example.com/" required /></label>
                <button className="primary" type="submit" disabled={installationBusy}>{installationBusy ? "Checking…" : "Validate installation"}</button>
              </form>
              {installationResult ? <div className={`installation-result ${installationResult.status === "installed" ? "success" : "warning"}`} role="status"><strong>{installationResult.status === "installed" ? "Installation verified" : "Installation not verified"}</strong><p>{installationResult.message}</p></div> : null}
              <p className="muted">Validation checks only the published HTML for this organization's loader key. It does not execute page scripts or submit a test visitor.</p>
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
