import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Workflow = {
  id: string;
  name: string;
  triggerType: string;
  status: string;
};

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("form_submission");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api("/api/v1/workflows");
    setWorkflows((res.data ?? []) as Workflow[]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load workflows"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/workflows", {
        method: "POST",
        body: JSON.stringify({
          name,
          triggerType,
          definition: { steps: [] },
          status: "draft"
        })
      });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Journeys</p>
          <h1>Workflows</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="stack-form" onSubmit={onCreate}>
        <div className="form-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Trigger
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
              <option value="form_submission">form_submission</option>
              <option value="contact_created">contact_created</option>
              <option value="property_changed">property_changed</option>
              <option value="segment_enter">segment_enter</option>
              <option value="manual">manual</option>
              <option value="event">event</option>
            </select>
          </label>
        </div>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create workflow"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Trigger</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((workflow) => (
              <tr key={workflow.id}>
                <td>{workflow.name}</td>
                <td>{workflow.triggerType}</td>
                <td>
                  <span className="pill">{workflow.status}</span>
                </td>
              </tr>
            ))}
            {!workflows.length ? (
              <tr>
                <td colSpan={3}>No workflows yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
