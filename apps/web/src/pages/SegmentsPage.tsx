import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatFilterAst } from "../lib/formatFilterAst";

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

type PreviewContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  lifecycleStage?: string | null;
};

const CORE_FIELDS = [
  { value: "email", label: "Email" },
  { value: "lifecycle_stage", label: "Lifecycle stage" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" }
];

function firstLeafFromFilter(filterAst: unknown) {
  if (!filterAst || typeof filterAst !== "object") {
    return { field: "lifecycle_stage", op: "eq" as const, value: "lead" };
  }
  const node = filterAst as { children?: Array<{ field?: string; op?: string; value?: unknown }> };
  const leaf = node.children?.[0];
  if (!leaf?.field || !leaf.op) {
    return { field: "lifecycle_stage", op: "eq" as const, value: "lead" };
  }
  return {
    field: leaf.field,
    op: leaf.op as "eq" | "contains" | "neq",
    value: String(leaf.value ?? "")
  };
}

export function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [field, setField] = useState("lifecycle_stage");
  const [op, setOp] = useState<"eq" | "contains" | "neq">("eq");
  const [value, setValue] = useState("lead");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewSegment, setPreviewSegment] = useState<Segment | null>(null);
  const [previewContacts, setPreviewContacts] = useState<PreviewContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const propertyLabels = useMemo(
    () => Object.fromEntries(definitions.map((definition) => [definition.internalName, definition.label])),
    [definitions]
  );

  async function loadCounts(segmentRows: Segment[]) {
    const entries = await Promise.all(segmentRows.map(async (segment) => {
      const res = await api(`/api/v1/segments/${segment.id}/estimate`, { method: "POST", body: "{}" });
      return [segment.id, Number((res.data as { count?: number })?.count ?? 0)] as const;
    }));
    setCounts(Object.fromEntries(entries));
  }

  async function load() {
    const [segmentsRes, propsRes] = await Promise.all([
      api("/api/v1/segments"),
      api("/api/v1/properties?objectType=contact")
    ]);
    const nextSegments = (segmentsRes.data ?? []) as Segment[];
    setSegments(nextSegments);
    setDefinitions(
      ((propsRes.data ?? []) as PropertyDefinition[]).filter((d) => !d.archived)
    );
    await loadCounts(nextSegments);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load segments"));
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setField("lifecycle_stage");
    setOp("eq");
    setValue("lead");
  }

  function startEdit(segment: Segment) {
    const leaf = firstLeafFromFilter(segment.filterAst);
    setEditingId(segment.id);
    setName(segment.name);
    setField(leaf.field);
    setOp(leaf.op);
    setValue(leaf.value);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const filterAst = {
        op: "and",
        children: [{ op, field, value }]
      };
      if (editingId) {
        await api(`/api/v1/segments/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ name, filterAst })
        });
        setMessage("Segment updated");
      } else {
        await api("/api/v1/segments", {
          method: "POST",
          body: JSON.stringify({ name, filterAst })
        });
        setMessage("Segment created");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(segment: Segment) {
    if (!window.confirm(`Delete segment "${segment.name}"?`)) return;
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/segments/${segment.id}`, { method: "DELETE" });
      if (editingId === segment.id) resetForm();
      setMessage(`Deleted ${segment.name}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function onPreview(segment: Segment) {
    setError(null);
    try {
      const res = await api(`/api/v1/segments/${segment.id}/contacts?limit=25`);
      setPreviewSegment(segment);
      setPreviewContacts((res.data ?? []) as PreviewContact[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
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
      {message ? <div className="banner info">{message}</div> : null}
      <form className="stack-form" onSubmit={onSubmit}>
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
        <div className="row-actions">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : editingId ? "Update segment" : "Create segment"}
          </button>
          {editingId ? (
            <button className="secondary" type="button" onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Filter</th>
              <th>Contacts</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.id}>
                <td>{segment.name}</td>
                <td>{segment.description ?? "—"}</td>
                <td>{formatFilterAst(segment.filterAst, propertyLabels)}</td>
                <td>{counts[segment.id] ?? "…"}</td>
                <td className="row-actions">
                  <button className="secondary" type="button" onClick={() => onPreview(segment)}>
                    Preview
                  </button>
                  <button className="secondary" type="button" onClick={() => startEdit(segment)}>
                    Edit
                  </button>
                  <button className="secondary" type="button" onClick={() => onDelete(segment)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!segments.length ? (
              <tr>
                <td colSpan={5}>No segments yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {previewSegment ? (
        <section className="stack-form">
          <header className="topbar">
            <div>
              <p className="eyebrow">Membership preview</p>
              <h2>{previewSegment.name}</h2>
            </div>
            <button className="secondary" type="button" onClick={() => setPreviewSegment(null)}>
              Close
            </button>
          </header>
          <p>{formatFilterAst(previewSegment.filterAst, propertyLabels)}</p>
          <p>{counts[previewSegment.id] ?? 0} matching contacts (showing up to 25)</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Lifecycle</th>
                </tr>
              </thead>
              <tbody>
                {previewContacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.email}</td>
                    <td>{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</td>
                    <td>{contact.lifecycleStage ?? "—"}</td>
                  </tr>
                ))}
                {!previewContacts.length ? (
                  <tr>
                    <td colSpan={3}>No matching contacts.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
