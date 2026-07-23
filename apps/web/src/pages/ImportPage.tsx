import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type ImportJob = {
  id: string;
  status: string;
  stats: Record<string, unknown>;
};

async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}

export function ImportPage() {
  const [propertiesFile, setPropertiesFile] = useState<File | null>(null);
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [propertiesJob, setPropertiesJob] = useState<ImportJob | null>(null);
  const [contactsJob, setContactsJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const parsed = await readJsonFile(propertiesFile);
      const properties = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { properties?: unknown }).properties)
          ? (parsed as { properties: unknown[] }).properties
          : null;
      if (!properties) throw new Error("Properties file must be a JSON array (or { properties: [...] })");
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

  async function onImportContacts(event: FormEvent) {
    event.preventDefault();
    if (!contactsFile) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = await readJsonFile(contactsFile);
      const contacts = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { contacts?: unknown }).contacts)
          ? (parsed as { contacts: unknown[] }).contacts
          : null;
      if (!contacts) throw new Error("Contacts file must be a JSON array (or { contacts: [...] })");
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
          <h1>HubSpot import</h1>
        </div>
        <Link className="quiet" to="/contacts">
          Back to contacts
        </Link>
      </header>
      <p className="muted">
        One-time schema-driven import. Upload property definitions first, then contacts. Sample fixtures live in{" "}
        <code>fixtures/hubspot/</code>.
      </p>
      {error ? <div className="banner error">{error}</div> : null}

      <form className="stack-form" onSubmit={onImportProperties}>
        <h3>1. Property definitions</h3>
        <label>
          JSON file
          <input
            type="file"
            accept="application/json,.json"
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
          JSON file
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => setContactsFile(e.target.files?.[0] ?? null)}
          />
        </label>
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
