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

const IMPORT_JOB_TIMEOUT_MS = 2 * 60 * 1000;
const IMPORT_JOB_POLL_INTERVAL_MS = 1000;

async function readRowsFile(file: File): Promise<Record<string, unknown>[]> {
  const text = await file.text();
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.toLowerCase().includes("csv");
  if (!isCsv) throw new Error("Upload one CSV file containing the contact fields and custom properties");
  return parseCsv(text).rows;
}

export function ImportPage() {
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [contactsRows, setContactsRows] = useState<Record<string, unknown>[]>([]);
  const [contactsHeaders, setContactsHeaders] = useState<string[]>([]);
  const [propertyDefinitions, setPropertyDefinitions] = useState<PropertyDefinition[]>([]);
  const [contactsPreview, setContactsPreview] = useState<ImportPreview | null>(null);
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
    const deadline = Date.now() + IMPORT_JOB_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const res = await api(`/api/v1/imports/${id}`);
      const job = res.data as ImportJob;
      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, IMPORT_JOB_POLL_INTERVAL_MS));
    }
    throw new Error("Timed out waiting for import job");
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
      const res = await api("/api/v1/imports/contacts/csv", {
        method: "POST",
        body: JSON.stringify({ contacts, headers: contactsHeaders })
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
        Upload one CSV file. Contact fields and identity columns are detected from the header row; every other column becomes a tenant custom property and is stored in the contact JSON structure. Sample fixtures live in{" "}
        <code>fixtures/hubspot/</code>.
      </p>
      {error ? <div className="banner error">{error}</div> : null}

      <form className="stack-form" onSubmit={onImportContacts}>
        <h3>Contact CSV</h3>
        <label>
          CSV file
          <input
            type="file"
            accept="text/csv,.csv"
            onChange={(e) => void onContactsFileChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {contactsPreview ? (
          <div className="code-block">
            <div>Detected {contactsPreview.rowCount} contact rows.</div>
            <div>Contact fields: {detectedFields.contactFields.join(", ") || "none"}</div>
            <div>Property fields: {detectedFields.propertyFields.join(", ") || "none"}</div>
            {detectedFields.propertyFields.length ? (
              <div className="muted">
                Custom columns are created automatically for this tenant if they do not already have a property definition.
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



