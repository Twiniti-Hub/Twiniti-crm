import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type PropertyDefinition = {
  id: string;
  internalName: string;
  label: string;
  dataType: string;
  fieldGroup: string | null;
  searchable: boolean;
  required: boolean;
  archived: boolean;
};

type Contact = {
  id: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  lifecycleStage: string | null;
  properties: Record<string, unknown>;
};

const CORE_NAMES = new Set(["email", "phone", "firstname", "lastname", "lifecyclestage"]);

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const listColumns = useMemo(
    () =>
      definitions
        .filter((d) => !CORE_NAMES.has(d.internalName) && (d.searchable || d.internalName === "jobtitle"))
        .slice(0, 3),
    [definitions]
  );

  const createFields = useMemo(
    () => definitions.filter((d) => !CORE_NAMES.has(d.internalName) && !d.archived).slice(0, 8),
    [definitions]
  );

  async function load() {
    const [contactsRes, propsRes] = await Promise.all([
      api("/api/v1/contacts"),
      api("/api/v1/properties?objectType=contact")
    ]);
    setContacts((contactsRes.data ?? []) as Contact[]);
    setDefinitions((propsRes.data ?? []) as PropertyDefinition[]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load contacts"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const properties: Record<string, unknown> = {};
      for (const field of createFields) {
        const value = customValues[field.internalName];
        if (value != null && value !== "") properties[field.internalName] = value;
      }
      await api("/api/v1/contacts", {
        method: "POST",
        body: JSON.stringify({
          email,
          phone: phone || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          lifecycleStage: lifecycleStage || undefined,
          properties
        })
      });
      setEmail("");
      setPhone("");
      setFirstName("");
      setLastName("");
      setLifecycleStage("");
      setCustomValues({});
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
          <p className="eyebrow">CRM</p>
          <h1>Contacts</h1>
        </div>
        <Link className="secondary" to="/import">
          CSV import
        </Link>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="stack-form" onSubmit={onCreate}>
        <div className="form-row">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label>
            First name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label>
            Last name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label>
            Lifecycle stage
            <input value={lifecycleStage} onChange={(e) => setLifecycleStage(e.target.value)} />
          </label>
          {createFields.map((field) => (
            <label key={field.id}>
              {field.label}
              <input
                value={customValues[field.internalName] ?? ""}
                required={field.required}
                onChange={(e) =>
                  setCustomValues((prev) => ({ ...prev, [field.internalName]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create contact"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Phone</th>
              <th>Name</th>
              <th>Lifecycle</th>
              {listColumns.map((col) => (
                <th key={col.id}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <Link to={`/contacts/${contact.id}`}>{contact.email}</Link>
                </td>
                <td>{contact.phone ?? "—"}</td>
                <td>{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</td>
                <td>{contact.lifecycleStage ?? "—"}</td>
                {listColumns.map((col) => (
                  <td key={col.id}>{String(contact.properties?.[col.internalName] ?? "—")}</td>
                ))}
              </tr>
            ))}
            {!contacts.length ? (
              <tr>
                <td colSpan={4 + listColumns.length}>No contacts yet. Import a CSV file to get started.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
