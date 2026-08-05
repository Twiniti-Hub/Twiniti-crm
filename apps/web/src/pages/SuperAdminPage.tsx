import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  api,
  clearWorkspaceContextId,
  getWorkspaceContextId,
  setWorkspaceContextId
} from "../lib/api";
import type { Me } from "../lib/me";
import { CountrySelect } from "../components/CountrySelect";

type Company = {
  id: string;
  name: string;
  regionCode?: "eu" | "uk" | "us";
  createdAt: string;
  memberCount: number;
};

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

type DashboardOrganization = Omit<Company, "regionCode"> & {
  regionCode: "eu" | "uk" | "us";
  billingStatus: string | null;
  subscriptionStatus: string | null;
  trialKind: string | null;
  trialEnd: string | null;
  trialConvertedAt: string | null;
  licenseStatus: string | null;
  licenseDecision: string | null;
  lastStripeEventCreatedAt: string | null;
  lastLicenseSyncAt: string | null;
  activeUserCount: number;
  agentCount: number;
  companyCount: number;
  contactCount: number;
};

type Dashboard = {
  generatedAt: string;
  totals: { organizations: number; users: number; agents: number; companies: number; contacts: number; trialing: number; paid: number; attention: number; trialsEnding: number };
  organizations: DashboardOrganization[];
};

export function SuperAdminPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardFilter, setDashboardFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(getWorkspaceContextId());
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [inviteAdminEmail, setInviteAdminEmail] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadCompanies() {
    const res = await api("/api/v1/organizations");
    const rows = res.data as Company[];
    setCompanies(rows);
    const storedWorkspaceId = getWorkspaceContextId();
    if (storedWorkspaceId && rows.some((row) => row.id === storedWorkspaceId)) {
      setActiveWorkspaceId(storedWorkspaceId);
    } else if (storedWorkspaceId) {
      clearWorkspaceContextId();
      setActiveWorkspaceId(null);
    }
    if (selectedId && !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? null);
    } else if (!selectedId && rows[0]) {
      setSelectedId(rows[0].id);
    }
  }

  async function loadDashboard() {
    const res = await api("/api/v1/super-admin/dashboard");
    setDashboard(res.data as Dashboard);
  }

  async function loadSelected(companyId: string) {
    const [membersRes, invitesRes] = await Promise.all([
      api(`/api/v1/organizations/${companyId}/members`),
      api(`/api/v1/organizations/${companyId}/invitations`)
    ]);
    setMembers(membersRes.data as Member[]);
    setInvitations(invitesRes.data as Invitation[]);
  }

  useEffect(() => {
    api("/api/v1/me")
      .then(async (res) => {
        const nextMe = res.data as Me;
        setMe(nextMe);
        if (nextMe.isSuperAdmin) {
          await Promise.all([loadCompanies(), loadDashboard()]);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId || !me?.isSuperAdmin) return;
    loadSelected(selectedId).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load company")
    );
  }, [selectedId, me?.isSuperAdmin]);

  if (loading) {
    return <div className="panel">Loading…</div>;
  }

  if (!me?.isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  const selected = companies.find((company) => company.id === selectedId) ?? null;
  const dashboardRows = dashboard?.organizations.filter((row) => {
    if (dashboardFilter === "trialing") return row.billingStatus === "trialing";
    if (dashboardFilter === "paid") return row.billingStatus === "active";
    if (dashboardFilter === "attention") return !["trialing", "active"].includes(row.billingStatus ?? "pending");
    return true;
  }) ?? [];

  async function onCreateCompany(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: { name: string; countryCode: string; inviteAdminEmail?: string } = {
        name: companyName.trim(),
        countryCode
      };
      if (inviteAdminEmail.trim()) body.inviteAdminEmail = inviteAdminEmail.trim();
      const res = await api("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify(body)
      });
      setCompanyName("");
      setCountryCode("");
      setInviteAdminEmail("");
      const invite = res.data?.invitation as Invitation | null | undefined;
      setMessage(
        invite
          ? invite.sent
            ? `Company created and invite sent to ${invite.email}.`
            : `Company created. Share invite link: ${invite.inviteUrl ?? "(check server logs)"}`
          : "Company created."
      );
      await loadCompanies();
      if (res.data?.id) setSelectedId(res.data.id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create company");
    } finally {
      setBusy(false);
    }
  }

  function onOpenWorkspace() {
    if (!activeWorkspaceId) return;
    const workspace = companies.find((company) => company.id === activeWorkspaceId);
    setWorkspaceContextId(activeWorkspaceId);
    setMessage(`Opening ${workspace?.name ?? "workspace"}…`);
    navigate("/", { replace: true });
  }

  function onReturnToAdminConsole() {
    clearWorkspaceContextId();
    window.location.assign("/super-admin");
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api(`/api/v1/organizations/${selectedId}/invitations`, {
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
      await loadSelected(selectedId);
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Platform</p>
          <h1>Super Admin</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner info">{message}</div> : null}

      {dashboard ? (
        <section className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
            <div><p className="eyebrow">Platform health</p><h3>Commercial dashboard</h3><p className="muted">Global view across US, UK, and EU workspaces. Updated {new Date(dashboard.generatedAt).toLocaleString()}.</p></div>
            <button className="secondary" type="button" onClick={() => loadDashboard().catch((err) => setError(err instanceof Error ? err.message : "Refresh failed"))}>Refresh</button>
          </div>
          <div className="metric-grid" style={{ marginTop: 16 }}>
            {[["Organizations", dashboard.totals.organizations], ["Active users", dashboard.totals.users], ["Agents", dashboard.totals.agents], ["Companies", dashboard.totals.companies], ["Contacts", dashboard.totals.contacts], ["In trial", dashboard.totals.trialing], ["Paid", dashboard.totals.paid], ["Needs attention", dashboard.totals.attention]].map(([label, value]) => <div className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          {dashboard.totals.trialsEnding > 0 ? <p className="banner info" style={{ marginTop: 14 }}>{dashboard.totals.trialsEnding} trial{dashboard.totals.trialsEnding === 1 ? " is" : "s are"} currently scheduled to end.</p> : null}
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <div className="form-row" style={{ alignItems: "end", marginBottom: 12 }}><label>Show <select value={dashboardFilter} onChange={(event) => setDashboardFilter(event.target.value)}><option value="all">All organizations</option><option value="trialing">Trial organizations</option><option value="paid">Paid organizations</option><option value="attention">Needs attention</option></select></label></div>
            <table><thead><tr><th>Organization</th><th>Region</th><th>Users</th><th>Agents</th><th>Companies</th><th>Contacts</th><th>Billing</th><th>Trial / conversion</th><th>License</th></tr></thead><tbody>{dashboardRows.map((row) => <tr key={`${row.regionCode}-${row.id}`}><td><b>{row.name}</b><small style={{ display: "block" }}>{new Date(row.createdAt).toLocaleDateString()}</small></td><td>{row.regionCode.toUpperCase()}</td><td>{row.activeUserCount}</td><td>{row.agentCount}</td><td>{row.companyCount}</td><td>{row.contactCount}</td><td>{row.billingStatus ?? "pending"}</td><td>{row.billingStatus === "trialing" ? `${row.trialKind ?? "unknown"}${row.trialEnd ? ` · ends ${new Date(row.trialEnd).toLocaleDateString()}` : ""}` : row.trialConvertedAt ? `Converted ${new Date(row.trialConvertedAt).toLocaleDateString()}` : "—"}</td><td>{row.licenseStatus ?? "pending"} · {row.licenseDecision ?? "unknown"}</td></tr>)}</tbody></table>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <p className="eyebrow">Workspace access</p>
        <h3>Open a workspace</h3>
        <p className="muted">
          Choose the workspace this browser should use for CRM operations. Access is limited to
          workspaces in this regional server.
        </p>
        <div className="form-row" style={{ alignItems: "end", marginTop: 12 }}>
          <label>
            Active workspace
            <select
              value={activeWorkspaceId ?? ""}
              onChange={(event) => setActiveWorkspaceId(event.target.value || null)}
            >
              <option value="">Choose a workspace…</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} ({company.regionCode?.toUpperCase() ?? "regional"})
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" type="button" disabled={!activeWorkspaceId} onClick={onOpenWorkspace}>
              Open workspace
            </button>
            {me.organizationId ? (
              <button className="secondary" type="button" onClick={onReturnToAdminConsole}>
                Return to admin console
              </button>
            ) : null}
          </div>
        </div>
        {me.organizationId ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Currently operating in <b>{me.organizationName ?? "selected workspace"}</b>.
          </p>
        ) : null}
      </section>

      <section className="panel">
        <p className="eyebrow">Create</p>
        <h3>New company</h3>
        <form className="stack-form" style={{ boxShadow: "none", border: 0, padding: 0 }} onSubmit={onCreateCompany}>
          <div className="form-row">
            <label>
              Company name
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder="Northwind Labs"
              />
            </label>
            <label>
              Country
              <CountrySelect value={countryCode} onChange={setCountryCode} />
            </label>
            <label>
              First admin email (optional)
              <input
                type="email"
                value={inviteAdminEmail}
                onChange={(e) => setInviteAdminEmail(e.target.value)}
                placeholder="admin@company.com"
              />
            </label>
          </div>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create company"}
          </button>
        </form>
      </section>

      <div className="split" style={{ marginTop: 15 }}>
        <section className="panel">
          <p className="eyebrow">Companies</p>
          <h3>All workspaces</h3>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Members</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    style={{ cursor: "pointer", background: company.id === selectedId ? "#f0f7f4" : undefined }}
                    onClick={() => setSelectedId(company.id)}
                  >
                    <td>{company.name}</td>
                    <td>{company.memberCount}</td>
                    <td>{new Date(company.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Manage</p>
          <h3>{selected ? selected.name : "Select a company"}</h3>
          {selected ? (
            <>
              <form className="stack-form" style={{ boxShadow: "none", border: 0, padding: 0, marginTop: 12 }} onSubmit={onInvite}>
                <label>
                  Invite email
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    placeholder="person@company.com"
                  />
                </label>
                <label>
                  Role
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}>
                    <option value="member">Member</option>
                    <option value="admin">Company Admin</option>
                  </select>
                </label>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Invite person"}
                </button>
              </form>

              <p className="eyebrow" style={{ marginTop: 18 }}>Members</p>
              <ul className="tool-list">
                {members.map((member) => (
                  <div key={member.id}>
                    <div>
                      <b>{member.displayName ?? member.email ?? "User"}</b>
                      <small>{member.email}</small>
                    </div>
                    <em>{member.role}</em>
                  </div>
                ))}
              </ul>

              <p className="eyebrow" style={{ marginTop: 18 }}>Pending invites</p>
              {invitations.length === 0 ? (
                <p className="muted">None</p>
              ) : (
                <ul className="tool-list">
                  {invitations.map((invite) => (
                    <div key={invite.id}>
                      <div>
                        <b>{invite.email}</b>
                        <small>Expires {new Date(invite.expiresAt).toLocaleDateString()}</small>
                      </div>
                      <em>{invite.role}</em>
                    </div>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="muted">Select a company to invite people.</p>
          )}
        </section>
      </div>
    </>
  );
}
