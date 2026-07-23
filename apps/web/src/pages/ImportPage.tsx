import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  classifyImportFields,
  mapImportRowsToPropertyDefinitions,
  parseCsv,
  type ImportFieldClassification
} from "../lib/csv";

type ImportJob = {
  id: string;
  status: string;
  stats: Record<string, unknown>;
};

type PropertyDefinition = {
  internalName: string;
  label?: string | null;
  archived?: boolean;
};

type ImportPreview = ImportFieldClassification & {
  headers: string[];
  rowCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRowsFile(file: File): Promise<Record<string, unknown>[]> {
  const text = await file.text();
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.toLowerCase().includes("csv");
  if (isCsv) return parseCsv(text).rows;

  const parsed = JSON.parse(text) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.contacts)
      ? parsed.contacts
      : isRecord(parsed) && Array.isArray(parsed.properties)
        ? parsed.properties
        : null;
  if (!rows || !rows.every(isRecord)) {
    throw new Error("File must be a CSV, a JSON array, or a JSON object containing contacts/properties");
  }
  return rows;
}

function propertyRowsForImport(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    if (typeof row.name === "string" && row.name.trim()) return row;
    const alias = row.internalName ?? row.propertyName;
    return typeof alias === "string" && alias.trim() ? { ...row, name: alias } : row;
  });
}

export function ImportPage() {
  const [propertiesFile, setPropertiesFile] = useState<File | null>(null);
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [contactsRows, setContactsRows] = useState<Record<string, unknown>[]>([]);
  const [contactsHeaders, setContactsHeaders] = useState<string[]>([]);
  const [propertyDefinitions, setPropertyDefinitions] = useState<PropertyDefinition[]>([]);
  const [contactsPreview, setContactsPreview] = useState<ImportPreview | null>(null);
  const [propertiesJob, setPropertiesJob] = useState<ImportJob | null>(null);
  const [contactsJob, setContactsJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/v1/properties?objectType=contact")
      .then((res) => setPropertyDefinitions((res.data ?? []) as PropertyDefinition[]))
      .catch(() => setPropertyDefinitions([]));
  }, []);

  const detectedFields = useMemo(
    () => {
      const definitions = propertyDefinitions.filter((field) => !field.archived);
      return classifyImportFields(contactsHeaders, definitions.flatMap((field) => [field.internalName, field.label ?? ""]));
    },
    [contactsHeaders, propertyDefinitions]
  );

  async function pollJob(id: string): Promise<ImportJob> {
    for (let i = 0; i < 60; i += 1) {
      const res = await api(`/api/v1/imports/${id}`);
      const job = res.data as ImportJob;
      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Timed out waiting for import job");
  }

  async function onImportProperties(event: FormEvent) {
    event.preventDefault();
    if (!propertiesFile) return;
    setBusy(true);
    setError(null);
    try {
      const properties = propertyRowsForImport(await readRowsFile(propertiesFile));
      if (!properties.length) throw new Error("Properties file must contain at least one row");
      const res = await api("/api/v1/imports/hubspot/properties", {
        method: "POST",
        body: JSON.stringify({ objectType: "contact", properties })
      });
      const job = await pollJob((res.data as ImportJob).id);
      setPropertiesJob(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Properties import failed");
    } finally {
      setBusy(false);
    }
  }

  async function onContactsFileChange(file: File | null) {
    setContactsFile(file);
    setContactsRows([]);
    setContactsHeaders([]);
    setContactsPreview(null);
    setError(null);
    if (!file) return;
    try {
      const rows = await readRowsFile(file);
      const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
      if (!rows.length || !headers.length) throw new Error("Contacts file must contain a header row and at least one contact");
      setContactsRows(rows);
      setContactsHeaders(headers);
      setContactsPreview({
        headers,
        rowCount: rows.length,
        ...classifyImportFields(headers, propertyDefinitions.flatMap((field) => [field.internalName, field.label ?? ""]))
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contacts file could not be read");
    }
  }

  async function onImportContacts(event: FormEvent) {
    event.preventDefault();
    if (!contactsFile) return;
    setBusy(true);
    setError(null);
    try {
      const rows = contactsRows.length ? contactsRows : await readRowsFile(contactsFile);
      const contacts = mapImportRowsToPropertyDefinitions(
        rows,
        propertyDefinitions.filter((field) => !field.archived)
      );
      if (!contacts.length) throw new Error("Contacts file must contain at least one contact");
      const res = await api("/api/v1/imports/hubspot", {
        method: "POST",
        body: JSON.stringify({ contacts })
      });
      const job = await pollJob((res.data as ImportJob).id);
      setContactsJob(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contacts import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Migration</p>
          <h1>Contact import</h1>
        </div>
        <Link className="quiet" to="/contacts">
          Back to contacts
        </Link>
      </header>
      <p className="muted">
        One-time schema-driven import. Upload property definitions first, then a CSV or JSON contacts export. Contact fields are detected from the header row; every other column is treated as a custom property. Sample fixtures live in{" "}
        <code>fixtures/hubspot/</code>.
      </p>
      {error ? <div className="banner error">{error}</div> : null}

      <form className="stack-form" onSubmit={onImportProperties}>
        <h3>1. Property definitions</h3>
        <label>
          JSON or CSV file
          <input
            type="file"
            accept="application/json,.json,text/csv,.csv"
            onChange={(e) => setPropertiesFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className="primary" type="submit" disabled={busy || !propertiesFile}>
          {busy ? "Working…" : "Import properties"}
        </button>
        {propertiesJob ? (
          <pre className="code-block">{JSON.stringify(propertiesJob, null, 2)}</pre>
        ) : null}
      </form>

      <form className="stack-form" onSubmit={onImportContacts}>
        <h3>2. Contacts</h3>
        <label>
          CSV or JSON file
          <input
            type="file"
            accept="text/csv,.csv,application/json,.json"
            onChange={(e) => void onContactsFileChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {contactsPreview ? (
          <div className="code-block">
            <div>Detected {contactsPreview.rowCount} contact rows.</div>
            <div>Contact fields: {detectedFields.contactFields.join(", ") || "none"}</div>
            <div>Property fields: {detectedFields.propertyFields.join(", ") || "none"}</div>
            {detectedFields.undefinedPropertyFields.length || (propertyDefinitions.length === 0 && detectedFields.propertyFields.length) ? (
              <div className="muted">
                {detectedFields.undefinedPropertyFields.length
                  ? `Not defined yet and will be skipped: ${detectedFields.undefinedPropertyFields.join(", ")}. Import their property definitions first if they should be retained.`
                  : "No contact property definitions are loaded; custom property columns will be skipped until their definitions are imported."}
              </div>
            ) : null}
          </div>
        ) : null}
        <button className="primary" type="submit" disabled={busy || !contactsFile}>
          {busy ? "Working…" : "Import contacts"}
        </button>
        {contactsJob ? (
          <pre className="code-block">{JSON.stringify(contactsJob, null, 2)}</pre>
        ) : null}
      </form>
    </>
  );
}
