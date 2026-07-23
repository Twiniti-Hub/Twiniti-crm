import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Agent = {
  id: string;
  name: string;
  purpose: string;
  scopes: string[];
  revokedAt?: string | null;
  lastUsedAt?: string | null;
};

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [scopesText, setScopesText] = useState("contacts:read,campaigns:preview");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api("/api/v1/agents");
    setAgents((res.data ?? []) as Agent[]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load agents"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCreatedToken(null);
    try {
      const scopes = scopesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api("/api/v1/agents", {
        method: "POST",
        body: JSON.stringify({
          name,
          purpose,
          scopes,
          expiresAt: null
        })
      });
      setCreatedToken(String(res.data?.token ?? ""));
      setName("");
      setPurpose("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await api(`/api/v1/agents/${id}/revoke`, { method: "POST", body: "{}" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Agent platform</p>
          <h1>Agents</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {createdToken ? (
        <div className="banner warning" role="status">
          Agent token (shown once): <code>{createdToken}</code>
        </div>
      ) : null}
      <form className="stack-form" onSubmit={onCreate}>
        <div className="form-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Purpose
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
          </label>
          <label>
            Scopes (comma-separated)
            <input value={scopesText} onChange={(e) => setScopesText(e.target.value)} required />
          </label>
        </div>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create agent"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Purpose</th>
              <th>Scopes</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td>{agent.name}</td>
                <td>{agent.purpose}</td>
                <td>
                  <code>{(agent.scopes ?? []).join(", ")}</code>
                </td>
                <td>{agent.revokedAt ? "Revoked" : "Active"}</td>
                <td>
                  {!agent.revokedAt ? (
                    <button className="secondary" type="button" onClick={() => revoke(agent.id)}>
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!agents.length ? (
              <tr>
                <td colSpan={5}>No agents yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
