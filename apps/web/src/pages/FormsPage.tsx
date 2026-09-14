import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type FormRow = {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  fields?: Array<{ name: string; label: string; type: string; required?: boolean }>;
};

type PropertyDefinition = {
  id: string;
  internalName: string;
  label: string;
  dataType: string;
  required: boolean;
  archived: boolean;
};

const CORE_ALWAYS = [
  { name: "email", label: "Email", type: "email", required: true }
];

export function FormsPage() {
  const [forms, setForms] = useState<FormRow[]>([]);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
  const [selectedProps, setSelectedProps] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [formsRes, propsRes] = await Promise.all([
      api("/api/v1/forms"),
      api("/api/v1/properties?objectType=contact")
    ]);
    setForms((formsRes.data ?? []) as FormRow[]);
    setDefinitions(
      ((propsRes.data ?? []) as PropertyDefinition[]).filter(
        (d) => !d.archived && d.internalName !== "email"
      )
    );
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load forms"));
  }, []);

  function toggleProp(internalName: string) {
    setSelectedProps((prev) =>
      prev.includes(internalName) ? prev.filter((x) => x !== internalName) : [...prev, internalName]
    );
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fields = [
        ...CORE_ALWAYS,
        ...definitions
          .filter((d) => selectedProps.includes(d.internalName))
          .map((d) => ({
            name: d.internalName,
            label: d.label,
            type: d.dataType === "boolean" ? "checkbox" : "text",
            required: d.required
          }))
      ];
      await api("/api/v1/forms", {
        method: "POST",
        body: JSON.stringify({ name, slug, fields })
      });
      setName("");
      setSlug("");
      setSelectedProps([]);
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
          <p className="eyebrow">Capture</p>
          <h1>Forms</h1>
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
            Slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              placeholder="newsletter-signup"
              required
            />
          </label>
        </div>
        <fieldset>
          <legend className="eyebrow">Fields from property definitions</legend>
          <p className="muted">Email is always included. Select additional HubSpot-mapped properties.</p>
          <div className="form-property-grid">
            {definitions.map((def) => (
              <label key={def.id} className="form-property-option">
                <span className="form-property-label">{def.label}</span>
                <span className="property-code">{def.internalName}</span>
                <span className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedProps.includes(def.internalName)}
                    onChange={() => toggleProp(def.internalName)}
                  />
                  Include field
                </span>
              </label>
            ))}
            {!definitions.length ? (
              <p className="muted">No property definitions yet — import HubSpot properties first.</p>
            ) : null}
          </div>
        </fieldset>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create form"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => (
              <tr key={form.id}>
                <td>{form.name}</td>
                <td>
                  <code>{form.slug}</code>
                </td>
                <td>{form.published ? "Yes" : "No"}</td>
              </tr>
            ))}
            {!forms.length ? (
              <tr>
                <td colSpan={3}>No forms yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
