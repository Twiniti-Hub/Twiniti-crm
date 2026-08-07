import { FormEvent, useEffect, useState } from "react";
import type { AgentScope } from "@twiniti/contracts";
import { api } from "../lib/api";

type Agent = {
  id: string;
  name: string;
  purpose: string;
  scopes: string[];
  revokedAt?: string | null;
  lastUsedAt?: string | null;
};

const AGENT_SCOPES: Array<{ value: AgentScope; label: string; description: string }> = [
  { value: "contacts:read", label: "Read contacts", description: "Search contacts and read timelines" },
  { value: "contacts:create", label: "Create contacts", description: "Create new contacts" },
  { value: "contacts:update", label: "Update contacts", description: "Update or upsert contacts" },
  { value: "companies:read", label: "Read companies", description: "Search and retrieve companies" },
  { value: "companies:create", label: "Create companies", description: "Create new companies" },
  { value: "companies:update", label: "Update companies", description: "Update existing companies" },
  { value: "segments:read", label: "Read segments", description: "View saved segments" },
  { value: "lists:read", label: "Read lists", description: "View saved lists" },
  { value: "forms:read", label: "Read forms", description: "View forms" },
  { value: "templates:read", label: "Read templates", description: "View email templates" },
  { value: "campaigns:read", label: "Read campaigns", description: "View campaigns" },
  { value: "campaigns:create", label: "Create campaigns", description: "Create campaign drafts" },
  { value: "campaigns:preview", label: "Preview campaigns", description: "Preview campaign content" },
  { value: "campaigns:request_approval", label: "Request campaign approval", description: "Submit campaigns for approval" },
  { value: "campaigns:send", label: "Send campaigns", description: "Send approved campaigns" },
  { value: "workflows:read", label: "Read workflows", description: "View workflows" },
  { value: "reports:read", label: "Read reports", description: "View reports" },
  { value: "email_events:read", label: "Read email events", description: "View email activity" }
];

function ScopePicker({
  value,
  onChange,
  label = "Scopes"
}: {
  value: AgentScope[];
  onChange: (scopes: AgentScope[]) => void;
  label?: string;
}) {
  function toggle(scope: AgentScope) {
    onChange(value.includes(scope) ? value.filter((item) => item !== scope) : [...value, scope]);
  }

  return (
    <div className="scope-picker">
      <span className="scope-label">{label}</span>
      <details>
        <summary>{value.length ? `${value.length} scope${value.length === 1 ? "" : "s"} selected` : "Choose scopes…"}</summary>
        <div className="scope-options">
          {AGENT_SCOPES.map((scope) => (
            <label className="scope-option" key={scope.value}>
              <input
                type="checkbox"
                checked={value.includes(scope.value)}
                onChange={() => toggle(scope.value)}
              />
              <span>
                <b>{scope.label}</b>
                <small>{scope.description}</small>
              </span>
            </label>
          ))}
        </div>
      </details>
      <small className="scope-summary">{value.length ? value.join(", ") : "Select at least one scope."}</small>
    </div>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<AgentScope[]>(["contacts:read"]);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingScopes, setEditingScopes] = useState<AgentScope[]>([]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
    setMessage(null);
    setCreatedToken(null);
    try {
      if (!selectedScopes.length) throw new Error("Select at least one agent scope");
      const res = await api("/api/v1/agents", {
        method: "POST",
        body: JSON.stringify({
          name,
          purpose,
          scopes: selectedScopes,
          expiresAt: null
        })
      });
      setCreatedToken(String(res.data?.token ?? ""));
      setName("");
      setPurpose("");
      setSelectedScopes(["contacts:read"]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/agents/${id}/revoke`, { method: "POST", body: "{}" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  function startEditing(agent: Agent) {
    setEditingAgentId(agent.id);
    setEditingScopes(agent.scopes.filter((scope): scope is AgentScope =>
      AGENT_SCOPES.some((option) => option.value === scope)
    ));
    setError(null);
    setMessage(null);
  }

  async function saveScopes(id: string) {
    if (!editingScopes.length) {
      setError("Select at least one agent scope");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/agents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ scopes: editingScopes })
      });
      setEditingAgentId(null);
      setEditingScopes([]);
      setMessage("Agent access updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update agent access");
    } finally {
      setBusy(false);
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
      {message ? <div className="banner info" role="status">{message}</div> : null}
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
          <ScopePicker value={selectedScopes} onChange={setSelectedScopes} />
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
                  {editingAgentId === agent.id ? (
                    <ScopePicker value={editingScopes} onChange={setEditingScopes} label="Edit access" />
                  ) : (
                    <code>{(agent.scopes ?? []).join(", ")}</code>
                  )}
                </td>
                <td>{agent.revokedAt ? "Revoked" : "Active"}</td>
                <td>
                  <div className="row-actions">
                    {!agent.revokedAt && editingAgentId !== agent.id ? (
                      <button className="secondary" type="button" onClick={() => startEditing(agent)}>
                        Edit access
                      </button>
                    ) : null}
                    {editingAgentId === agent.id ? (
                      <>
                        <button className="primary" type="button" disabled={busy} onClick={() => saveScopes(agent.id)}>
                          {busy ? "Saving…" : "Save access"}
                        </button>
                        <button className="secondary" type="button" disabled={busy} onClick={() => setEditingAgentId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : null}
                    {!agent.revokedAt ? (
                      <button className="secondary" type="button" onClick={() => revoke(agent.id)}>
                        Revoke
                      </button>
                    ) : null}
                  </div>
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
