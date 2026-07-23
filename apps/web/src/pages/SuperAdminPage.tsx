import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Me } from "../lib/me";

type Company = {
  id: string;
  name: string;
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

export function SuperAdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [companyName, setCompanyName] = useState("");
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
    if (selectedId && !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? null);
    } else if (!selectedId && rows[0]) {
      setSelectedId(rows[0].id);
    }
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
          await loadCompanies();
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

  async function onCreateCompany(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: { name: string; inviteAdminEmail?: string } = { name: companyName.trim() };
      if (inviteAdminEmail.trim()) body.inviteAdminEmail = inviteAdminEmail.trim();
      const res = await api("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify(body)
      });
      setCompanyName("");
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
