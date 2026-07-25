import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type Company = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
};

type CompaniesMeta = {
  limit: number;
  page: number;
  total: number;
  pageCount: number;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<CompaniesMeta | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  async function load(nextPage = page, nextPageSize = pageSize, nextQuery = searchQuery) {
    const params = new URLSearchParams({
      limit: String(nextPageSize),
      page: String(nextPage)
    });
    if (nextQuery.trim()) params.set("query", nextQuery.trim());
    const res = await api(`/api/v1/companies?${params.toString()}`);
    setCompanies((res.data ?? []) as Company[]);
    setMeta((res.meta ?? null) as CompaniesMeta | null);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load companies"));
  }, [page, pageSize, searchQuery]);

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
        <div className="topbar">
          <label style={{ flex: 1 }}>
            Filter by company name
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
              placeholder="Search by company name or domain"
            />
          </label>
          <div className="muted">
            Showing {companies.length ? `${(page - 1) * pageSize + 1}-${(page - 1) * pageSize + companies.length}` : "0"} of {meta?.total ?? companies.length} companies
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
          <label>
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
                <td>
                  <Link to={`/companies/${company.id}`}>{company.name}</Link>
                </td>
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
            disabled={meta ? page >= meta.pageCount : companies.length < pageSize}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
