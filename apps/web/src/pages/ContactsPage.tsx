import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BoardSearchBar, KanbanBoard } from "../components/KanbanBoard";
import { BoardViewToolbar } from "../components/BoardViewToolbar";
import { api } from "../lib/api";
import type { Me } from "../lib/me";

type PropertyDefinition = {
  id: string;
  objectType: "contact" | "company";
  internalName: string;
  label: string;
  dataType: string;
  fieldGroup: string | null;
  options: unknown[];
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

type ContactsMeta = {
  limit: number;
  page: number;
  total: number;
  pageCount: number;
};

type PropertyEditorState = {
  label: string;
  fieldGroup: string;
  dataType: string;
  searchable: boolean;
  required: boolean;
  archived: boolean;
  optionsText: string;
};

type PropertyDeletionImpact = {
  property: {
    id: string;
    label: string;
    internalName: string;
    archived: boolean;
  };
  contactsWithValue: number;
  historyEntries: number;
  references: {
    segments: number;
    forms: number;
    workflows: number;
    savedViews: number;
  };
};

const CORE_NAMES = new Set(["email", "phone", "firstname", "lastname", "lifecyclestage"]);
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const PROPERTY_DATA_TYPES = ["string", "number", "boolean", "date", "enum", "multi_enum", "json"] as const;

function optionListToText(options: unknown[]) {
  if (!Array.isArray(options) || options.length === 0) return "";
  return options
    .map((option) => {
      if (typeof option === "string") return option;
      if (option && typeof option === "object") {
        const value = (option as { value?: unknown }).value;
        const label = (option as { label?: unknown }).label;
        return String(value ?? label ?? "");
      }
      return String(option);
    })
    .filter(Boolean)
    .join(", ");
}

function parseOptions(optionsText: string) {
  return optionsText
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({ label: value, value }));
}

function getPropertyEditorState(definition: PropertyDefinition): PropertyEditorState {
  return {
    label: definition.label,
    fieldGroup: definition.fieldGroup ?? "",
    dataType: definition.dataType,
    searchable: definition.searchable,
    required: definition.required,
    archived: definition.archived,
    optionsText: optionListToText(definition.options)
  };
}

function getBadgeText(definition: PropertyDefinition) {
  const badges = [definition.dataType];
  if (definition.required) badges.push("Required");
  if (definition.searchable) badges.push("Searchable");
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
      <>
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
        {field.dataType === "multi_enum" ? (
          <small className="muted">Multi-select values can be refined later from the property manager.</small>
        ) : null}
      </>
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

export function ContactsPage() {
  const [searchParams] = useSearchParams();
  const isListView = searchParams.get("view") === "list";
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [showAllCreateFields, setShowAllCreateFields] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ContactsMeta | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [boardSearchInput, setBoardSearchInput] = useState("");
  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [boardRefreshKey, setBoardRefreshKey] = useState(0);
  const [boardViewId, setBoardViewId] = useState<string | null>(null);
  const [canManageShared, setCanManageShared] = useState(false);
  const [propertySearch, setPropertySearch] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [propertyEditor, setPropertyEditor] = useState<PropertyEditorState | null>(null);
  const [propertyBusy, setPropertyBusy] = useState(false);
  const [propertyMessage, setPropertyMessage] = useState<string | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<PropertyDeletionImpact | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [newProperty, setNewProperty] = useState({
    label: "",
    internalName: "",
    fieldGroup: "",
    dataType: "string",
    searchable: false,
    required: false,
    optionsText: ""
  });

  const customDefinitions = useMemo(
    () => definitions.filter((d) => !CORE_NAMES.has(d.internalName)),
    [definitions]
  );

  const createFields = useMemo(
    () => customDefinitions.filter((d) => !d.archived),
    [customDefinitions]
  );

  const visibleCreateFields = useMemo(
    () => (showAllCreateFields ? createFields : createFields.slice(0, 4)),
    [createFields, showAllCreateFields]
  );

  const listColumns = useMemo(
    () =>
      createFields
        .filter((d) => d.searchable || d.internalName === "jobtitle" || d.internalName === "job_title")
        .slice(0, 3),
    [createFields]
  );

  const filteredProperties = useMemo(() => {
    const query = propertySearch.trim().toLowerCase();
    if (!query) return customDefinitions;
    return customDefinitions.filter((definition) =>
      [definition.label, definition.internalName, definition.fieldGroup ?? ""]
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [customDefinitions, propertySearch]);

  const selectedProperty = useMemo(
    () => customDefinitions.find((definition) => definition.id === selectedPropertyId) ?? null,
    [customDefinitions, selectedPropertyId]
  );

  async function load(nextPage = page, nextPageSize = pageSize, nextQuery = searchQuery, listMode = isListView) {
    const propsRes = await api("/api/v1/properties?objectType=contact");
    const nextDefinitions = (propsRes.data ?? []) as PropertyDefinition[];
    setDefinitions(nextDefinitions);
    setSelectedPropertyId((current) => {
      const available = nextDefinitions.filter((definition) => !CORE_NAMES.has(definition.internalName));
      if (!available.length) return null;
      if (current && available.some((definition) => definition.id === current)) return current;
      return available[0].id;
    });
    if (!listMode) return;
    const params = new URLSearchParams({
      limit: String(nextPageSize),
      page: String(nextPage)
    });
    if (nextQuery.trim()) params.set("query", nextQuery.trim());
    const contactsRes = await api(`/api/v1/contacts?${params.toString()}`);
    setContacts((contactsRes.data ?? []) as Contact[]);
    setMeta((contactsRes.meta ?? null) as ContactsMeta | null);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load contacts"));
  }, [page, pageSize, searchQuery, isListView]);

  useEffect(() => {
    api("/api/v1/me")
      .then((res) => {
        const me = res.data as Me;
        setCanManageShared(me.role === "admin" || me.isSuperAdmin === true);
      })
      .catch(() => setCanManageShared(false));
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      setPropertyEditor(getPropertyEditorState(selectedProperty));
    } else {
      setPropertyEditor(null);
    }
    setDeleteImpact(null);
  }, [selectedProperty]);

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
      createDialogRef.current?.close();
      setBoardRefreshKey((current) => current + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateProperty(event: FormEvent) {
    event.preventDefault();
    setPropertyBusy(true);
    setPropertyMessage(null);
    setError(null);
    try {
      const res = await api("/api/v1/properties", {
        method: "POST",
        body: JSON.stringify({
          objectType: "contact",
          internalName: newProperty.internalName.trim(),
          label: newProperty.label.trim(),
          dataType: newProperty.dataType,
          fieldGroup: newProperty.fieldGroup.trim() || undefined,
          searchable: newProperty.searchable,
          required: newProperty.required,
          options: parseOptions(newProperty.optionsText)
        })
      });
      const created = res.data as PropertyDefinition;
      setNewProperty({
        label: "",
        internalName: "",
        fieldGroup: "",
        dataType: "string",
        searchable: false,
        required: false,
        optionsText: ""
      });
      setPropertyMessage(`Created ${created.label}.`);
      await load(1, pageSize, searchQuery);
      setSelectedPropertyId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Property create failed");
    } finally {
      setPropertyBusy(false);
    }
  }

  async function onSaveProperty(event: FormEvent) {
    event.preventDefault();
    if (!selectedProperty || !propertyEditor) return;
    setPropertyBusy(true);
    setPropertyMessage(null);
    setError(null);
    try {
      await api(`/api/v1/properties/${selectedProperty.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: propertyEditor.label.trim(),
          fieldGroup: propertyEditor.fieldGroup.trim() || undefined,
          dataType: propertyEditor.dataType,
          searchable: propertyEditor.searchable,
          required: propertyEditor.required,
          archived: propertyEditor.archived,
          options: parseOptions(propertyEditor.optionsText)
        })
      });
      setPropertyMessage(`Updated ${propertyEditor.label}.`);
      await load(page, pageSize, searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Property update failed");
    } finally {
      setPropertyBusy(false);
    }
  }

  async function onLoadDeleteImpact() {
    if (!selectedProperty) return;
    setDeleteBusy(true);
    setPropertyMessage(null);
    setError(null);
    try {
      const res = await api(`/api/v1/properties/${selectedProperty.id}/impact`);
      setDeleteImpact((res.data ?? null) as PropertyDeletionImpact | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load delete impact");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onDeleteProperty() {
    if (!selectedProperty || !deleteImpact) return;
    setDeleteBusy(true);
    setPropertyMessage(null);
    setError(null);
    try {
      await api(`/api/v1/properties/${selectedProperty.id}`, {
        method: "DELETE"
      });
      setPropertyMessage(
        `Deleted ${deleteImpact.property.label} and removed values from ${deleteImpact.contactsWithValue} contacts.`
      );
      setDeleteImpact(null);
      await load(page, pageSize, searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Property delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <header className="topbar topbar-wrap">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>Contacts</h1>
          <p className="muted page-intro">
            Kanban is the default board for lifecycle work. Switch to List when you need dense tabular browsing.
          </p>
        </div>
        <div className="topbar-actions">
          <div className="view-toggle" role="group" aria-label="Contacts view">
            <Link className={`secondary${!isListView ? " is-active" : ""}`} to="/contacts">
              Kanban
            </Link>
            <Link className={`secondary${isListView ? " is-active" : ""}`} to="/contacts?view=list">
              List
            </Link>
          </div>
          <button className="primary" type="button" onClick={() => createDialogRef.current?.showModal()}>
            New contact
          </button>
          <a className="secondary" href="#contact-property-manager">
            Manage fields
          </a>
          <Link className="secondary" to="/import">
            CSV import
          </Link>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {propertyMessage ? <div className="banner info">{propertyMessage}</div> : null}

      <dialog ref={createDialogRef} className="app-dialog">
        <form className="stack-form dialog-form" onSubmit={onCreate}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Create</p>
              <h3>New contact</h3>
            </div>
            <button className="secondary" type="button" onClick={() => createDialogRef.current?.close()}>
              Close
            </button>
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
              <input value={lifecycleStage} onChange={(e) => setLifecycleStage(e.target.value)} placeholder="lead" />
            </label>
          </div>

          {createFields.length > 0 ? (
            <section className="property-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Custom fields</p>
                  <h3>Selected properties for quick entry</h3>
                </div>
                {createFields.length > 4 ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setShowAllCreateFields((current) => !current)}
                  >
                    {showAllCreateFields ? "Show fewer" : `Show all ${createFields.length}`}
                  </button>
                ) : null}
              </div>
              <div className="property-grid">
                {visibleCreateFields.map((field) => (
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
          ) : (
            <div className="banner info">No custom contact fields yet. Create one below when you are ready.</div>
          )}

          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create contact"}
          </button>
        </form>
      </dialog>

      {!isListView ? (
        <>
          <BoardViewToolbar
            objectType="contact"
            selectedViewId={boardViewId}
            onViewChange={setBoardViewId}
            canManageShared={canManageShared}
          />
          <BoardSearchBar
            value={boardSearchInput}
            onChange={setBoardSearchInput}
            onApply={() => setBoardSearchQuery(boardSearchInput.trim())}
            onClear={() => {
              setBoardSearchInput("");
              setBoardSearchQuery("");
            }}
          />
          <KanbanBoard
            objectType="contact"
            detailPath={(id) => `/contacts/${id}`}
            searchQuery={boardSearchQuery}
            refreshKey={boardRefreshKey}
            viewId={boardViewId}
          />
        </>
      ) : null}

      {isListView ? <div className="table-wrap">
        <div className="topbar topbar-wrap">
          <label className="filter-field">
            Filter by contact or company
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setPage(1);
                  setSearchQuery(searchInput.trim());
                }
              }}
              placeholder="Search by name, email, phone, or company"
            />
          </label>
          <div className="toolbar-actions">
            <div className="muted">
              Showing {contacts.length ? `${(page - 1) * pageSize + 1}-${(page - 1) * pageSize + contacts.length}` : "0"} of {meta?.total ?? contacts.length} contacts
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setPage(1);
                setSearchQuery(searchInput.trim());
              }}
            >
              Apply filter
            </button>
            <label className="compact-field">
              Per page
              <select
                value={pageSize}
                onChange={(e) => {
                  const nextSize = Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number];
                  setPageSize(nextSize);
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              type="button"
              disabled={!searchInput && !searchQuery}
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
                setPage(1);
              }}
            >
              Clear
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Phone</th>
              <th>Name</th>
              <th>Lifecycle</th>
              {listColumns.map((col) => (
                <th key={col.id} title={col.label}>
                  <span className="table-heading-text">{col.label}</span>
                </th>
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
                  <td key={col.id} title={String(contact.properties?.[col.internalName] ?? "—")}>
                    <span className="table-cell-text">{String(contact.properties?.[col.internalName] ?? "—")}</span>
                  </td>
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
        <div className="topbar">
          <button className="secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            Previous
          </button>
          <div className="muted">
            Page {meta?.page ?? page} of {meta?.pageCount ?? 1}
          </div>
          <button
            className="secondary"
            type="button"
            disabled={meta ? page >= meta.pageCount : contacts.length < pageSize}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div> : null}

      <section id="contact-property-manager" className="panel" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Property manager</p>
            <h3>Refine contact field definitions</h3>
          </div>
          <span className="muted">Edit labels, groups, field types, and archive stale fields without touching contact records.</span>
        </div>
        <div className="manager-layout">
          <div className="manager-list">
            <label>
              Find a field
              <input
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                placeholder="Search label, internal name, or group"
              />
            </label>
            <div className="property-list">
              {filteredProperties.map((definition) => (
                <button
                  key={definition.id}
                  type="button"
                  className={`property-list-item${selectedPropertyId === definition.id ? " active" : ""}`}
                  onClick={() => setSelectedPropertyId(definition.id)}
                >
                  <span className="property-list-title">{definition.label}</span>
                  <span className="property-code">{definition.internalName}</span>
                  <span className="property-badges">
                    {getBadgeText(definition).map((badge) => (
                      <span key={`${definition.id}-list-${badge}`} className="property-badge">
                        {badge}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
              {filteredProperties.length === 0 ? (
                <div className="muted">No contact properties match that filter.</div>
              ) : null}
            </div>
          </div>

          <div className="manager-editor">
            <form className="stack-form inset-form" onSubmit={onCreateProperty}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Add field</p>
                  <h3>New custom property</h3>
                </div>
              </div>
              <div className="form-row">
                <label>
                  Label
                  <input
                    value={newProperty.label}
                    onChange={(e) => setNewProperty((prev) => ({ ...prev, label: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Internal name
                  <input
                    value={newProperty.internalName}
                    onChange={(e) => setNewProperty((prev) => ({ ...prev, internalName: e.target.value }))}
                    required
                    placeholder="favorite_product"
                  />
                </label>
                <label>
                  Group
                  <input
                    value={newProperty.fieldGroup}
                    onChange={(e) => setNewProperty((prev) => ({ ...prev, fieldGroup: e.target.value }))}
                    placeholder="Sales"
                  />
                </label>
                <label>
                  Data type
                  <select
                    value={newProperty.dataType}
                    onChange={(e) => setNewProperty((prev) => ({ ...prev, dataType: e.target.value }))}
                  >
                    {PROPERTY_DATA_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Options
                <input
                  value={newProperty.optionsText}
                  onChange={(e) => setNewProperty((prev) => ({ ...prev, optionsText: e.target.value }))}
                  placeholder="One, Two, Three"
                />
              </label>
              <div className="checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newProperty.searchable}
                    onChange={(e) => setNewProperty((prev) => ({ ...prev, searchable: e.target.checked }))}
                  />
                  Searchable
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newProperty.required}
                    onChange={(e) => setNewProperty((prev) => ({ ...prev, required: e.target.checked }))}
                  />
                  Required
                </label>
              </div>
              <button className="primary" type="submit" disabled={propertyBusy}>
                {propertyBusy ? "Saving…" : "Create field"}
              </button>
            </form>

            {selectedProperty && propertyEditor ? (
              <form className="stack-form inset-form" onSubmit={onSaveProperty}>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Edit field</p>
                    <h3>{selectedProperty.label}</h3>
                  </div>
                  <span className="property-code">{selectedProperty.internalName}</span>
                </div>
                <div className="form-row">
                  <label>
                    Label
                    <input
                      value={propertyEditor.label}
                      onChange={(e) => setPropertyEditor((prev) => (prev ? { ...prev, label: e.target.value } : prev))}
                      required
                    />
                  </label>
                  <label>
                    Group
                    <input
                      value={propertyEditor.fieldGroup}
                      onChange={(e) => setPropertyEditor((prev) => (prev ? { ...prev, fieldGroup: e.target.value } : prev))}
                    />
                  </label>
                  <label>
                    Data type
                    <select
                      value={propertyEditor.dataType}
                      onChange={(e) => setPropertyEditor((prev) => (prev ? { ...prev, dataType: e.target.value } : prev))}
                    >
                      {PROPERTY_DATA_TYPES.map((type) => (
                        <option key={`${selectedProperty.id}-${type}`} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Options
                  <input
                    value={propertyEditor.optionsText}
                    onChange={(e) => setPropertyEditor((prev) => (prev ? { ...prev, optionsText: e.target.value } : prev))}
                    placeholder="One, Two, Three"
                  />
                </label>
                <div className="checkbox-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={propertyEditor.searchable}
                      onChange={(e) => setPropertyEditor((prev) => (prev ? { ...prev, searchable: e.target.checked } : prev))}
                    />
                    Searchable
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={propertyEditor.required}
                      onChange={(e) => setPropertyEditor((prev) => (prev ? { ...prev, required: e.target.checked } : prev))}
                    />
                    Required
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={propertyEditor.archived}
                      onChange={(e) => setPropertyEditor((prev) => (prev ? { ...prev, archived: e.target.checked } : prev))}
                    />
                    Archived
                  </label>
                </div>
                <div className="banner warning">
                  Archive is the safe first step. Archived fields stay out of create flows and lists, but existing
                  contact records keep their data until an admin permanently deletes the field.
                </div>
                <button className="primary" type="submit" disabled={propertyBusy}>
                  {propertyBusy ? "Saving…" : "Update field"}
                </button>
                <section className="danger-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Permanent delete</p>
                      <h3>Remove this field and its contact data</h3>
                    </div>
                  </div>
                  <p className="muted danger-copy">
                    This is admin-only. It deletes the field definition and removes the stored value from every contact
                    in this organization. Property history is retained for audit review.
                  </p>
                  {deleteImpact ? (
                    <div className="danger-impact">
                      <div className="danger-stats">
                        <span>{deleteImpact.contactsWithValue} contacts with a value</span>
                        <span>{deleteImpact.historyEntries} history entries retained</span>
                        <span>{deleteImpact.references.segments} segments reference it</span>
                        <span>{deleteImpact.references.forms} forms reference it</span>
                        <span>{deleteImpact.references.workflows} workflows reference it</span>
                        <span>{deleteImpact.references.savedViews} saved views reference it</span>
                      </div>
                      <div className="row-actions">
                        <button className="secondary" type="button" onClick={() => setDeleteImpact(null)} disabled={deleteBusy}>
                          Cancel
                        </button>
                        <button className="danger-button" type="button" onClick={onDeleteProperty} disabled={deleteBusy}>
                          {deleteBusy ? "Deleting…" : "Delete permanently"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="secondary" type="button" onClick={onLoadDeleteImpact} disabled={deleteBusy}>
                      {deleteBusy ? "Checking impact…" : "Review delete impact"}
                    </button>
                  )}
                </section>
              </form>
            ) : (
              <div className="banner info">Select a field to edit its label, group, or visibility.</div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
