import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  changeSetId: string | null;
  actorType: string;
  source: string | null;
  createdAt: string;
};

type ChangeSet = {
  key: string;
  createdAt: string;
  source: string;
  changes: PropertyHistory[];
};

const CORE_NAMES = new Set(["email", "firstname", "lastname", "lifecyclestage"]);
const HISTORY_PAGE_SIZE = 8;

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  firstName: "First name",
  firstname: "First name",
  lastName: "Last name",
  lastname: "Last name",
  lifecycleStage: "Lifecycle stage",
  lifecyclestage: "Lifecycle stage"
};

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

function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") return value === "" ? "empty" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fieldLabel(propertyName: string, definitions: PropertyDefinition[]): string {
  const mapped = FIELD_LABELS[propertyName];
  if (mapped) return mapped;
  const bare = propertyName.startsWith("properties.")
    ? propertyName.slice("properties.".length)
    : propertyName;
  const definition = definitions.find((item) => item.internalName === bare || item.internalName === propertyName);
  if (definition) return definition.label;
  return propertyName;
}

function groupHistory(rows: PropertyHistory[]): ChangeSet[] {
  const sets: ChangeSet[] = [];
  const indexByChangeSet = new Map<string, number>();
  for (const row of rows) {
    const source = row.source ?? row.actorType;
    if (row.changeSetId) {
      const existing = indexByChangeSet.get(row.changeSetId);
      if (existing !== undefined) {
        sets[existing].changes.push(row);
        continue;
      }
      indexByChangeSet.set(row.changeSetId, sets.length);
      sets.push({
        key: row.changeSetId,
        createdAt: row.createdAt,
        source,
        changes: [row]
      });
      continue;
    }
    sets.push({
      key: row.id,
      createdAt: row.createdAt,
      source,
      changes: [row]
    });
  }
  return sets;
}

function timelineActivityLabel(event: TimelineEvent): string {
  if (event.eventType === "note.created") return "Note";
  if (event.eventType.startsWith("email.")) {
    const kind = event.eventType.replace(/^email\./, "");
    if (kind === "sent") return "Email sent";
    if (kind === "received") return "Email received";
    if (kind === "replied") return "Email reply";
    return `Email · ${kind}`;
  }
  return event.eventType;
}

function isEmailTimelineEvent(event: TimelineEvent): boolean {
  return event.eventType.startsWith("email.");
}

function emailBodies(event: TimelineEvent): { text: string | null; html: string | null } {
  const textRaw = typeof event.payload.bodyText === "string" ? event.payload.bodyText.trim() : "";
  const htmlRaw = typeof event.payload.bodyHtml === "string" ? event.payload.bodyHtml.trim() : "";
  return {
    text: textRaw || null,
    html: htmlRaw || null
  };
}

function timelineDetails(event: TimelineEvent): string {
  if (event.eventType === "note.created") {
    return typeof event.payload.body === "string" ? event.payload.body : "";
  }
  const subject = typeof event.payload.subject === "string" ? event.payload.subject.trim() : "";
  const fromEmail = typeof event.payload.fromEmail === "string" ? event.payload.fromEmail : null;
  if (subject) return subject;
  return fromEmail ?? event.source;
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
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const emailDialogRef = useRef<HTMLDialogElement>(null);
  const [visibleSetCount, setVisibleSetCount] = useState(HISTORY_PAGE_SIZE);
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

  const changeSets = useMemo(() => groupHistory(history), [history]);
  const visibleChangeSets = changeSets.slice(0, visibleSetCount);

  async function loadTimelineAndHistory(contactId: string) {
    const [timelineRes, historyRes] = await Promise.all([
      api(`/api/v1/contacts/${contactId}/timeline`),
      api(`/api/v1/contacts/${contactId}/history`)
    ]);
    setTimeline((timelineRes.data ?? []) as TimelineEvent[]);
    setHistory((historyRes.data ?? []) as PropertyHistory[]);
  }

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
        setVisibleSetCount(HISTORY_PAGE_SIZE);
        setExpandedSets(new Set());
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
      await loadTimelineAndHistory(row.id);
      setVisibleSetCount(HISTORY_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAddNote(event: FormEvent) {
    event.preventDefault();
    if (!contact || !noteBody.trim()) return;
    setNoteBusy(true);
    setError(null);
    try {
      await api(`/api/v1/contacts/${contact.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteBody.trim() })
      });
      setNoteBody("");
      await loadTimelineAndHistory(contact.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setNoteBusy(false);
    }
  }

  function toggleChangeSet(key: string) {
    setExpandedSets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const openEmailEvent = useMemo(
    () => (openEmailId ? timeline.find((event) => event.id === openEmailId) ?? null : null),
    [openEmailId, timeline]
  );
  const openEmailBodies = openEmailEvent ? emailBodies(openEmailEvent) : null;
  const openEmailSubject = openEmailEvent && typeof openEmailEvent.payload.subject === "string"
    ? openEmailEvent.payload.subject.trim()
    : "";
  const openEmailFrom = openEmailEvent && typeof openEmailEvent.payload.fromEmail === "string"
    ? openEmailEvent.payload.fromEmail
    : null;
  const openEmailTo = openEmailEvent && Array.isArray(openEmailEvent.payload.toEmails)
    ? openEmailEvent.payload.toEmails.filter((value): value is string => typeof value === "string")
    : [];

  useEffect(() => {
    const dialog = emailDialogRef.current;
    if (!dialog) return;
    if (openEmailEvent) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
  }, [openEmailEvent]);

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
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Activity</p>
                <h3>Notes and customer activity</h3>
              </div>
              <span className="muted">Capture a note without sending email.</span>
            </div>
            <form className="note-composer" onSubmit={onAddNote}>
              <label>
                Add note
                <textarea
                  rows={3}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Call outcome, next step, context…"
                  maxLength={8000}
                />
              </label>
              <div className="note-composer-actions">
                <span className="muted">{noteBody.trim().length}/8000</span>
                <button className="primary" type="submit" disabled={noteBusy || !noteBody.trim()}>
                  {noteBusy ? "Saving…" : "Add note"}
                </button>
              </div>
            </form>
            {timeline.length === 0 ? <p className="muted">No activity recorded yet.</p> : (
              <div className="activity-list">
                {timeline.map((event) => {
                  const details = timelineDetails(event);
                  const isNote = event.eventType === "note.created";
                  const isEmail = isEmailTimelineEvent(event);
                  const fromEmail = typeof event.payload.fromEmail === "string" ? event.payload.fromEmail : null;
                  const toEmails = Array.isArray(event.payload.toEmails)
                    ? event.payload.toEmails.filter((value): value is string => typeof value === "string")
                    : [];
                  const subject = typeof event.payload.subject === "string" ? event.payload.subject.trim() : "";
                  const bodies = emailBodies(event);
                  const canOpen = Boolean(bodies.text || bodies.html);
                  return (
                    <article
                      key={event.id}
                      className={`activity-card${isEmail ? " activity-card-email" : ""}${isNote ? " activity-card-note" : ""}`}
                    >
                      <div className="activity-card-head">
                        <span className={`activity-badge${isEmail ? " activity-badge-email" : ""}${isNote ? " activity-badge-note" : ""}`}>
                          {timelineActivityLabel(event)}
                        </span>
                        <time className="muted">{new Date(event.occurredAt).toLocaleString()}</time>
                      </div>
                      {isEmail ? (
                        <>
                          <strong className="activity-email-subject">
                            {subject || "(No subject)"}
                          </strong>
                          {fromEmail ? <p className="muted activity-email-meta">From {fromEmail}</p> : null}
                          {toEmails.length > 0 ? (
                            <p className="muted activity-email-meta">To {toEmails.join(", ")}</p>
                          ) : null}
                          {canOpen ? (
                            <button
                              type="button"
                              className="quiet activity-email-toggle"
                              onClick={() => setOpenEmailId(event.id)}
                            >
                              Open email
                            </button>
                          ) : (
                            <p className="muted">No message body was captured for this email.</p>
                          )}
                        </>
                      ) : isNote ? (
                        <span className="timeline-note-body">{details}</span>
                      ) : (
                        <p className="activity-generic-details">{details}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel" style={{ marginTop: 15 }}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Audit trail</p>
                <h3>Contact changes</h3>
              </div>
              <span className="muted">
                {changeSets.length === 0
                  ? "No field changes recorded yet."
                  : `${changeSets.length} change${changeSets.length === 1 ? "" : "s"}`}
              </span>
            </div>
            {changeSets.length === 0 ? null : (
              <div className="history-list">
                {visibleChangeSets.map((set) => {
                  const expanded = expandedSets.has(set.key);
                  const count = set.changes.length;
                  return (
                    <article key={set.key} className="history-card">
                      <button
                        type="button"
                        className="history-card-toggle"
                        aria-expanded={expanded}
                        onClick={() => toggleChangeSet(set.key)}
                      >
                        <span className="history-card-summary">
                          <strong>{new Date(set.createdAt).toLocaleString()}</strong>
                          <span className="muted">
                            {count} field{count === 1 ? "" : "s"} updated · {set.source}
                          </span>
                        </span>
                        <span className="history-card-chevron" aria-hidden="true">
                          {expanded ? "▾" : "▸"}
                        </span>
                      </button>
                      {expanded ? (
                        <ul className="history-diff-list">
                          {set.changes.map((change) => (
                            <li key={change.id}>
                              <span className="history-diff-field">
                                {fieldLabel(change.propertyName, definitions)}
                              </span>
                              <span className="history-diff-values">
                                <span>{formatHistoryValue(change.oldValue)}</span>
                                <span aria-hidden="true"> → </span>
                                <span>{formatHistoryValue(change.newValue)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  );
                })}
                {visibleSetCount < changeSets.length ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setVisibleSetCount((prev) => prev + HISTORY_PAGE_SIZE)}
                  >
                    Show more ({changeSets.length - visibleSetCount} remaining)
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </>
      ) : null}

      <dialog
        ref={emailDialogRef}
        className="app-dialog email-viewer-dialog"
        onClose={() => setOpenEmailId(null)}
      >
        {openEmailEvent && openEmailBodies ? (
          <div className="email-viewer">
            <div className="email-viewer-header">
              <div>
                <p className="eyebrow">Email</p>
                <h2>{openEmailSubject || "(No subject)"}</h2>
                {openEmailFrom ? <p className="muted">From {openEmailFrom}</p> : null}
                {openEmailTo.length > 0 ? <p className="muted">To {openEmailTo.join(", ")}</p> : null}
                <p className="muted">{new Date(openEmailEvent.occurredAt).toLocaleString()}</p>
              </div>
              <button type="button" className="quiet" onClick={() => setOpenEmailId(null)}>
                Close
              </button>
            </div>
            <div className="email-viewer-body">
              {openEmailBodies.html ? (
                <iframe
                  className="email-viewer-frame"
                  title={openEmailSubject || "Email contents"}
                  sandbox=""
                  srcDoc={openEmailBodies.html}
                />
              ) : openEmailBodies.text ? (
                <pre className="activity-email-body email-viewer-text">{openEmailBodies.text}</pre>
              ) : (
                <p className="muted">No message body was captured for this email.</p>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
