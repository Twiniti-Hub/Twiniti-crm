import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Segment = {
  id: string;
  name: string;
  description: string | null;
  filterAst: unknown;
};

type PropertyDefinition = {
  id: string;
  internalName: string;
  label: string;
  archived: boolean;
};

const CORE_FIELDS = [
  { value: "email", label: "Email" },
  { value: "lifecycle_stage", label: "Lifecycle stage" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" }
];

export function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
  const [name, setName] = useState("");
  const [field, setField] = useState("lifecycle_stage");
  const [op, setOp] = useState<"eq" | "contains" | "neq">("eq");
  const [value, setValue] = useState("lead");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [segmentsRes, propsRes] = await Promise.all([
      api("/api/v1/segments"),
      api("/api/v1/properties?objectType=contact")
    ]);
    setSegments((segmentsRes.data ?? []) as Segment[]);
    setDefinitions(
      ((propsRes.data ?? []) as PropertyDefinition[]).filter((d) => !d.archived)
    );
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load segments"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const filterAst = {
        op: "and",
        children: [{ op, field, value }]
      };
      await api("/api/v1/segments", {
        method: "POST",
        body: JSON.stringify({ name, filterAst })
      });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  const fieldOptions = [
    ...CORE_FIELDS,
    ...definitions
      .filter((d) => !["email", "firstname", "lastname", "lifecyclestage"].includes(d.internalName))
      .map((d) => ({ value: `properties.${d.internalName}`, label: `${d.label} (${d.internalName})` }))
  ];

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
        <div className="form-row">
          <label>
            Field
            <select value={field} onChange={(e) => setField(e.target.value)}>
              {fieldOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Operator
            <select value={op} onChange={(e) => setOp(e.target.value as typeof op)}>
              <option value="eq">equals</option>
              <option value="neq">not equals</option>
              <option value="contains">contains</option>
            </select>
          </label>
          <label>
            Value
            <input value={value} onChange={(e) => setValue(e.target.value)} required />
          </label>
        </div>
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
