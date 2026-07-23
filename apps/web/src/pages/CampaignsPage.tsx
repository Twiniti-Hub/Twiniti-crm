import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Campaign = {
  id: string;
  name: string;
  status: string;
  subject: string | null;
  recipientCount?: number | null;
};

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("<p>Hello {{firstName}}</p>");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api("/api/v1/campaigns");
    setCampaigns((res.data ?? []) as Campaign[]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load campaigns"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api("/api/v1/campaigns", {
        method: "POST",
        body: JSON.stringify({ name, subject, htmlBody })
      });
      setName("");
      await load();
      setMessage("Draft campaign created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(id: string, action: "preview" | "request-approval" | "approve" | "send") {
    setError(null);
    setMessage(null);
    try {
      const res = await api(`/api/v1/campaigns/${id}/${action}`, { method: "POST", body: "{}" });
      setMessage(`${action}: ${JSON.stringify(res.data)}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Outbound</p>
          <h1>Campaigns</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {message ? <div className="banner info">{message}</div> : null}
      <form className="stack-form" onSubmit={onCreate}>
        <div className="form-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        </div>
        <label>
          HTML body
          <textarea value={htmlBody} onChange={(e) => setHtmlBody(e.target.value)} rows={4} />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create draft"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Subject</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>{campaign.name}</td>
                <td>
                  <span className="pill">{campaign.status}</span>
                </td>
                <td>{campaign.subject ?? "—"}</td>
                <td className="row-actions">
                  <button className="secondary" type="button" onClick={() => runAction(campaign.id, "preview")}>
                    Preview
                  </button>
                  <button className="secondary" type="button" onClick={() => runAction(campaign.id, "request-approval")}>
                    Request approval
                  </button>
                  <button className="secondary" type="button" onClick={() => runAction(campaign.id, "approve")}>
                    Approve
                  </button>
                  <button className="primary" type="button" onClick={() => runAction(campaign.id, "send")}>
                    Send
                  </button>
                </td>
              </tr>
            ))}
            {!campaigns.length ? (
              <tr>
                <td colSpan={4}>No campaigns yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
