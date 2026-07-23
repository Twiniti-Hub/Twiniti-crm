import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Company = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
};

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api("/api/v1/companies");
    setCompanies((res.data ?? []) as Company[]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load companies"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/companies", {
        method: "POST",
        body: JSON.stringify({
          name,
          domain: domain || undefined,
          industry: industry || undefined
        })
      });
      setName("");
      setDomain("");
      setIndustry("");
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
          <h1>Companies</h1>
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
            Domain
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
          </label>
          <label>
            Industry
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </label>
        </div>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create company"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Industry</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td>{company.name}</td>
                <td>{company.domain ?? "—"}</td>
                <td>{company.industry ?? "—"}</td>
              </tr>
            ))}
            {!companies.length ? (
              <tr>
                <td colSpan={3}>No companies yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
