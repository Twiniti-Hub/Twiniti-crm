import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

type PropertyDefinition = {
  id: string;
  internalName: string;
  label: string;
  dataType: string;
  fieldGroup: string | null;
  options: unknown[];
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
  version: number;
};

type TimelineEvent = {
  id: string;
  eventType: string;
  source: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

type PropertyHistory = {
  id: string;
  propertyName: string;
  oldValue: unknown;
  newValue: unknown;
  actorType: string;
  source: string | null;
  createdAt: string;
};

const CORE_NAMES = new Set(["email", "firstname", "lastname", "lifecyclestage"]);

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [history, setHistory] = useState<PropertyHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const fields = definitions.filter((d) => !CORE_NAMES.has(d.internalName) && !d.archived);
    const groups = new Map<string, PropertyDefinition[]>();
    for (const field of fields) {
      const key = field.fieldGroup || "other";
      const list = groups.get(key) ?? [];
      list.push(field);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [definitions]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api(`/api/v1/contacts/${id}`),
      api("/api/v1/properties?objectType=contact"),
      api(`/api/v1/contacts/${id}/timeline`),
      api(`/api/v1/contacts/${id}/history`)
    ])
      .then(([contactRes, propsRes, timelineRes, historyRes]) => {
        const row = contactRes.data as Contact;
        setContact(row);
        setEmail(row.email);
        setPhone(row.phone ?? "");
        setFirstName(row.firstName ?? "");
        setLastName(row.lastName ?? "");
        setLifecycleStage(row.lifecycleStage ?? "");
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(row.properties ?? {})) {
          next[key] = value == null ? "" : String(value);
        }
        setCustomValues(next);
        setDefinitions((propsRes.data ?? []) as PropertyDefinition[]);
        setTimeline((timelineRes.data ?? []) as TimelineEvent[]);
        setHistory((historyRes.data ?? []) as PropertyHistory[]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load contact"));
  }, [id]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!contact) return;
    setBusy(true);
    setError(null);
    try {
      const properties: Record<string, unknown> = { ...(contact.properties ?? {}) };
      for (const field of definitions) {
        if (CORE_NAMES.has(field.internalName) || field.archived) continue;
        const value = customValues[field.internalName];
        if (value === "" || value == null) delete properties[field.internalName];
        else properties[field.internalName] = value;
      }
      const res = await api(`/api/v1/contacts/${contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          email,
          phone: phone || null,
          firstName: firstName || null,
          lastName: lastName || null,
          lifecycleStage: lifecycleStage || null,
          properties,
          version: contact.version
        })
      });
      const row = res.data as Contact;
      setContact(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!contact && !error) {
    return <div className="banner info">Loading contact…</div>;
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>{contact?.email ?? "Contact"}</h1>
        </div>
        <Link className="quiet" to="/contacts">
          Back to contacts
        </Link>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {contact ? (
        <>
        <form className="stack-form" onSubmit={onSave}>
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
          </div>
          {grouped.map(([group, fields]) => (
            <section key={group} className="panel" style={{ marginTop: 12 }}>
              <p className="eyebrow">{group}</p>
              <div className="form-row">
                {fields.map((field) => (
                  <label key={field.id}>
                    {field.label}
                    <span className="muted"> ({field.internalName})</span>
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
            </section>
          ))}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save contact"}
          </button>
        </form>
        <section className="panel" style={{ marginTop: 15 }}>
          <p className="eyebrow">Activity</p>
          <h3>Email and customer activity</h3>
          {timeline.length === 0 ? <p className="muted">No activity recorded yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Activity</th><th>Details</th></tr></thead>
                <tbody>
                  {timeline.map((event) => {
                    const subject = typeof event.payload.subject === "string" ? event.payload.subject : null;
                    const fromEmail = typeof event.payload.fromEmail === "string" ? event.payload.fromEmail : null;
                    return (
                      <tr key={event.id}>
                        <td>{new Date(event.occurredAt).toLocaleString()}</td>
                        <td>{event.eventType.replace(/^email\./, "")}</td>
                        <td>{subject ?? fromEmail ?? event.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel" style={{ marginTop: 15 }}>
          <p className="eyebrow">Audit trail</p>
          <h3>Contact changes</h3>
          {history.length === 0 ? <p className="muted">No field changes recorded yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Field</th><th>Change</th><th>Source</th></tr></thead>
                <tbody>
                  {history.map((change) => (
                    <tr key={change.id}>
                      <td>{new Date(change.createdAt).toLocaleString()}</td>
                      <td>{change.propertyName}</td>
                      <td>{JSON.stringify(change.oldValue) ?? "null"} → {JSON.stringify(change.newValue) ?? "null"}</td>
                      <td>{change.source ?? change.actorType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </>
      ) : null}
    </>
  );
}
