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
  provider: string;
  status: string;
  stats: Record<string, unknown>;
  error?: string | null;
  createdAt?: string;
  completedAt?: string | null;
};

type ImportFailure = {
  id: string;
  externalId?: string | null;
  error?: string | null;
  payload: Record<string, unknown>;
  createdAt?: string;
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

const IMPORT_JOB_POLL_INTERVAL_MS = 1500;

function isTerminalJobStatus(status: string | undefined): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function readStat(job: ImportJob, key: string): number {
  const value = job.stats[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function formatJobSummary(job: ImportJob): string {
  const total = readStat(job, "total") || readStat(job, "queued");
  const imported = readStat(job, "imported");
  const updated = readStat(job, "updated");
  const failed = readStat(job, "failed");
  const queued = readStat(job, "queued");
  if (job.status === "queued" && queued) return `${queued} queued`;
  if (job.status === "running") return `${imported + updated + failed}/${total || queued} processed`;
  return `${imported} imported, ${updated} updated, ${failed} failed${total ? ` of ${total}` : ""}`;
}

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
  const [companiesFile, setCompaniesFile] = useState<File | null>(null);
  const [companiesRows, setCompaniesRows] = useState<Record<string, unknown>[]>([]);
  const [companiesHeaders, setCompaniesHeaders] = useState<string[]>([]);
  const [companiesPreview, setCompaniesPreview] = useState<{ headers: string[]; rowCount: number } | null>(null);
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [jobHistory, setJobHistory] = useState<ImportJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobFailures, setJobFailures] = useState<Record<string, ImportFailure[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"contacts" | "companies" | null>(null);

  async function loadJobHistory() {
    const res = await api("/api/v1/imports");
    const jobs = (res.data ?? []) as ImportJob[];
    setJobHistory(jobs);
    setSelectedJobId((current) => current ?? jobs[0]?.id ?? null);
    return jobs;
  }

  useEffect(() => {
    api("/api/v1/properties?objectType=contact")
      .then((res) => setPropertyDefinitions((res.data ?? []) as PropertyDefinition[]))
      .catch(() => setPropertyDefinitions([]));
    void loadJobHistory().catch(() => {
      setJobHistory([]);
    });
  }, []);

  const detectedFields = useMemo(
    () => {
      const definitions = propertyDefinitions.filter((field) => !field.archived);
      return classifyImportFields(contactsHeaders, definitions.flatMap((field) => [field.internalName, field.label ?? ""]));
    },
    [contactsHeaders, propertyDefinitions]
  );

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

  async function onCompaniesFileChange(file: File | null) {
    setCompaniesFile(file);
    setCompaniesRows([]);
    setCompaniesHeaders([]);
    setCompaniesPreview(null);
    setError(null);
    if (!file) return;
    try {
      const rows = await readRowsFile(file);
      const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
      if (!rows.length || !headers.length) throw new Error("Company file must contain a header row and at least one company");
      setCompaniesRows(rows);
      setCompaniesHeaders(headers);
      setCompaniesPreview({ headers, rowCount: rows.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Company file could not be read");
    }
  }

  async function onImportContacts(event: FormEvent) {
    event.preventDefault();
    if (!contactsFile) return;
    setBusy("contacts");
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
      const job = res.data as ImportJob;
      setActiveJob(job);
      setSelectedJobId(job.id);
      await loadJobHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contacts import failed");
    } finally {
      setBusy(null);
    }
  }

  async function onImportCompanies(event: FormEvent) {
    event.preventDefault();
    if (!companiesFile) return;
    setBusy("companies");
    setError(null);
    try {
      const rows = companiesRows.length ? companiesRows : await readRowsFile(companiesFile);
      if (!rows.length) throw new Error("Company file must contain at least one company");
      const res = await api("/api/v1/imports/companies/csv", {
        method: "POST",
        body: JSON.stringify({ companies: rows, headers: companiesHeaders })
      });
      const job = res.data as ImportJob;
      setActiveJob(job);
      setSelectedJobId(job.id);
      await loadJobHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Company import failed");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!activeJob?.id || isTerminalJobStatus(activeJob.status)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api(`/api/v1/imports/${activeJob.id}`)
        .then((res) => {
          if (cancelled) return;
          const job = res.data as ImportJob;
          setActiveJob(job);
          void loadJobHistory().catch(() => {
            // Preserve the current view if the history refresh fails.
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Unable to refresh import status");
        });
    }, IMPORT_JOB_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeJob]);

  useEffect(() => {
    if (!selectedJobId || jobFailures[selectedJobId]) return;
    let cancelled = false;
    void api(`/api/v1/imports/${selectedJobId}/failures`)
      .then((res) => {
        if (cancelled) return;
        setJobFailures((current) => ({
          ...current,
          [selectedJobId]: (res.data ?? []) as ImportFailure[]
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setJobFailures((current) => ({
          ...current,
          [selectedJobId]: []
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [jobFailures, selectedJobId]);

  const selectedJob = jobHistory.find((job) => job.id === selectedJobId) ?? activeJob;
  const selectedFailures = selectedJobId ? jobFailures[selectedJobId] : undefined;

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
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
          <button className="primary" type="submit" disabled={busy !== null || !contactsFile}>
            {busy === "contacts" ? "Working…" : "Import contacts"}
          </button>
        </form>

        <form className="stack-form" onSubmit={onImportCompanies}>
          <h3>Company CSV</h3>
          <label>
            CSV file
            <input
              type="file"
              accept="text/csv,.csv"
              onChange={(e) => void onCompaniesFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="muted">
            Supported columns: <code>Company name</code>, <code>Industry</code>, <code>Company owner</code>, <code>Create Date</code>, <code>Phone Number</code>, <code>Last Activity Date</code>, <code>City</code>, <code>Country/Region</code>.
          </div>
          {companiesPreview ? (
            <div className="code-block">
              <div>Detected {companiesPreview.rowCount} company rows.</div>
              <div>Headers: {companiesPreview.headers.join(", ")}</div>
              <div className="muted">
                <code>Company name</code> and <code>Industry</code> map to core company fields. The remaining supported columns are stored as company properties.
              </div>
            </div>
          ) : null}
          <button className="primary" type="submit" disabled={busy !== null || !companiesFile}>
            {busy === "companies" ? "Working…" : "Import companies"}
          </button>
        </form>
      </div>

      {activeJob && !isTerminalJobStatus(activeJob.status) ? (
        <div className="muted">
          Import is running in the background. You can keep this page open for live status while larger files finish.
        </div>
      ) : null}
      {activeJob ? (
        <pre className="code-block">{JSON.stringify(activeJob, null, 2)}</pre>
      ) : null}

      <section className="stack-form">
        <div className="topbar">
          <div>
            <p className="eyebrow">History</p>
            <h3>Recent imports</h3>
          </div>
        </div>
        {!jobHistory.length ? (
          <div className="muted">No import jobs recorded yet.</div>
        ) : (
          <div className="code-block">
            {jobHistory.map((job) => (
              <button
                key={job.id}
                className="quiet"
                type="button"
                onClick={() => setSelectedJobId(job.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.75rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  fontWeight: selectedJobId === job.id ? 700 : 400
                }}
              >
                <div>{job.createdAt ? new Date(job.createdAt).toLocaleString() : job.id}</div>
                <div className="muted">
                  {job.status} · {formatJobSummary(job)}
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedJob ? (
          <div className="code-block">
            <div><strong>Selected job:</strong> {selectedJob.id}</div>
            <div><strong>Status:</strong> {selectedJob.status}</div>
            <div><strong>Summary:</strong> {formatJobSummary(selectedJob)}</div>
            {selectedJob.error ? <div><strong>Job error:</strong> {selectedJob.error}</div> : null}
            <div><strong>Started:</strong> {selectedJob.createdAt ? new Date(selectedJob.createdAt).toLocaleString() : "Unknown"}</div>
            <div><strong>Completed:</strong> {selectedJob.completedAt ? new Date(selectedJob.completedAt).toLocaleString() : "Not yet"}</div>
          </div>
        ) : null}

        {selectedJob ? (
          <div>
            <h3>Failed rows</h3>
            {selectedFailures === undefined ? (
              <div className="muted">Loading failed rows…</div>
            ) : selectedFailures.length === 0 ? (
              <div className="muted">No failed rows recorded for this import.</div>
            ) : (
              <div className="code-block">
                {selectedFailures.map((failure) => (
                  <div key={failure.id} style={{ marginBottom: "1rem" }}>
                    <div><strong>Row:</strong> {failure.externalId || failure.id}</div>
                    <div><strong>Error:</strong> {failure.error || "Unknown failure"}</div>
                    <pre>{JSON.stringify(failure.payload, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </>
  );
}



