import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

const DEFAULT_FILTER_AST = JSON.stringify(
  { op: "and", children: [{ op: "eq", field: "lifecycle_stage", value: "lead" }] },
  null,
  2
);

type Segment = {
  id: string;
  name: string;
  description: string | null;
  filterAst: unknown;
};

export function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [name, setName] = useState("");
  const [filterAstText, setFilterAstText] = useState(DEFAULT_FILTER_AST);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api("/api/v1/segments");
    setSegments((res.data ?? []) as Segment[]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load segments"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const filterAst = JSON.parse(filterAstText) as unknown;
      await api("/api/v1/segments", {
        method: "POST",
        body: JSON.stringify({ name, filterAst })
      });
      setName("");
      setFilterAstText(DEFAULT_FILTER_AST);
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
          <p className="eyebrow">Audiences</p>
          <h1>Segments</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="stack-form" onSubmit={onCreate}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Filter AST (JSON)
          <textarea value={filterAstText} onChange={(e) => setFilterAstText(e.target.value)} rows={8} />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create segment"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Filter</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.id}>
                <td>{segment.name}</td>
                <td>{segment.description ?? "—"}</td>
                <td>
                  <code>{JSON.stringify(segment.filterAst)}</code>
                </td>
              </tr>
            ))}
            {!segments.length ? (
              <tr>
                <td colSpan={3}>No segments yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
