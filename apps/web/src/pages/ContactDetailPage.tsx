import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
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

function getBadgeText(definition: PropertyDefinition) {
  const badges = [definition.dataType];
  if (definition.required) badges.push("Required");
  if (definition.archived) badges.push("Archived");
  return badges;
}

function renderPropertyInput(
  field: PropertyDefinition,
  value: string,
  onChange: (nextValue: string) => void
) {
  const hasOptions = Array.isArray(field.options) && field.options.length > 0;
  if (field.dataType === "boolean") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }
  if ((field.dataType === "enum" || field.dataType === "multi_enum") && hasOptions) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set</option>
        {field.options.map((option, index) => {
          const choice = typeof option === "string"
            ? { label: option, value: option }
            : {
                label: String((option as { label?: unknown }).label ?? (option as { value?: unknown }).value ?? ""),
                value: String((option as { value?: unknown }).value ?? (option as { label?: unknown }).label ?? "")
              };
          return (
            <option key={`${field.id}-${choice.value}-${index}`} value={choice.value}>
              {choice.label}
            </option>
          );
        })}
      </select>
    );
  }
  if (field.dataType === "date") {
    return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.dataType === "json") {
    return (
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='{"key":"value"}'
      />
    );
  }
  if (field.dataType === "number") {
    return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} />;
}

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
  const [fieldSearch, setFieldSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const search = fieldSearch.trim().toLowerCase();
    const fields = definitions.filter((definition) => {
      if (CORE_NAMES.has(definition.internalName) || definition.archived) return false;
      if (!search) return true;
      return [definition.label, definition.internalName, definition.fieldGroup ?? ""]
        .some((value) => value.toLowerCase().includes(search));
    });
    const groups = new Map<string, PropertyDefinition[]>();
    for (const field of fields) {
      const key = field.fieldGroup || "Other";
      const list = groups.get(key) ?? [];
      list.push(field);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [definitions, fieldSearch]);

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
      <header className="topbar topbar-wrap">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>{contact?.email ?? "Contact"}</h1>
          <p className="muted page-intro">
            Core identity stays at the top. Custom fields are grouped below with room for long labels
            and internal names.
          </p>
        </div>
        <Link className="quiet" to="/contacts">
          Back to contacts
        </Link>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {contact ? (
        <>
          <form className="stack-form" onSubmit={onSave}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Profile</p>
                <h3>Edit contact</h3>
              </div>
              <span className="muted">Update identity fields separately from grouped custom properties.</span>
            </div>
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

            <section className="property-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Custom properties</p>
                  <h3>Grouped field editor</h3>
                </div>
                <label className="compact-field">
                  Find a field
                  <input
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    placeholder="Search label, internal name, or group"
                  />
                </label>
              </div>
              {grouped.map(([group, fields]) => (
                <section key={group} className="panel inset-panel">
                  <p className="eyebrow">{group}</p>
                  <div className="property-grid">
                    {fields.map((field) => (
                      <label key={field.id} className="property-input-card">
                        <span className="property-input-head">
                          <span className="property-input-title">{field.label}</span>
                          <span className="property-code">{field.internalName}</span>
                        </span>
                        <span className="property-badges">
                          {getBadgeText(field).map((badge) => (
                            <span key={`${field.id}-${badge}`} className="property-badge">
                              {badge}
                            </span>
                          ))}
                        </span>
                        {renderPropertyInput(field, customValues[field.internalName] ?? "", (nextValue) =>
                          setCustomValues((prev) => ({ ...prev, [field.internalName]: nextValue }))
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              {grouped.length === 0 ? <div className="banner info">No custom fields match that filter.</div> : null}
            </section>

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
