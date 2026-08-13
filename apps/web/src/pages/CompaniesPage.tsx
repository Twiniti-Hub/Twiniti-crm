import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BoardSearchBar, KanbanBoard } from "../components/KanbanBoard";
import { BoardViewToolbar } from "../components/BoardViewToolbar";
import { api } from "../lib/api";
import type { Me } from "../lib/me";

type Company = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  lifecycleStage?: string | null;
};

type CompaniesMeta = {
  limit: number;
  page: number;
  total: number;
  pageCount: number;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function CompaniesPage() {
  const [searchParams] = useSearchParams();
  const isListView = searchParams.get("view") === "list";
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("prospect");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<CompaniesMeta | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [boardSearchInput, setBoardSearchInput] = useState("");
  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [boardRefreshKey, setBoardRefreshKey] = useState(0);
  const [boardViewId, setBoardViewId] = useState<string | null>(null);
  const [canManageShared, setCanManageShared] = useState(false);

  async function load(nextPage = page, nextPageSize = pageSize, nextQuery = searchQuery) {
    if (!isListView) return;
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
  }, [page, pageSize, searchQuery, isListView]);

  useEffect(() => {
    api("/api/v1/me")
      .then((res) => {
        const me = res.data as Me;
        setCanManageShared(me.role === "admin" || me.isSuperAdmin === true);
      })
      .catch(() => setCanManageShared(false));
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
          industry: industry || undefined,
          lifecycleStage: lifecycleStage || undefined
        })
      });
      setName("");
      setDomain("");
      setIndustry("");
      setLifecycleStage("prospect");
      createDialogRef.current?.close();
      setBoardRefreshKey((current) => current + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar topbar-wrap">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>Companies</h1>
          <p className="muted page-intro">
            Kanban tracks relationship stage. Use List for dense browsing of name, domain, and industry.
          </p>
        </div>
        <div className="topbar-actions">
          <div className="view-toggle" role="group" aria-label="Companies view">
            <Link className={`secondary${!isListView ? " is-active" : ""}`} to="/companies">
              Kanban
            </Link>
            <Link className={`secondary${isListView ? " is-active" : ""}`} to="/companies?view=list">
              List
            </Link>
          </div>
          <button className="primary" type="button" onClick={() => createDialogRef.current?.showModal()}>
            New company
          </button>
          <Link className="secondary" to="/import">
            CSV import
          </Link>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}

      <dialog ref={createDialogRef} className="app-dialog">
        <form className="stack-form dialog-form" onSubmit={onCreate}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Create</p>
              <h3>New company</h3>
            </div>
            <button className="secondary" type="button" onClick={() => createDialogRef.current?.close()}>
              Close
            </button>
          </div>
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
            <label>
              Lifecycle stage
              <select value={lifecycleStage} onChange={(e) => setLifecycleStage(e.target.value)}>
                <option value="prospect">Prospect</option>
                <option value="qualified">Qualified</option>
                <option value="customer">Customer</option>
                <option value="partner">Partner</option>
                <option value="former_customer">Former Customer</option>
                <option value="">Unassigned</option>
              </select>
            </label>
          </div>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create company"}
          </button>
        </form>
      </dialog>

      {!isListView ? (
        <>
          <BoardViewToolbar
            objectType="company"
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
            objectType="company"
            detailPath={(id) => `/companies/${id}`}
            searchQuery={boardSearchQuery}
            refreshKey={boardRefreshKey}
            viewId={boardViewId}
          />
        </>
      ) : (
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
                <th>Lifecycle</th>
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
                  <td>{company.lifecycleStage ?? "—"}</td>
                </tr>
              ))}
              {!companies.length ? (
                <tr>
                  <td colSpan={4}>No companies yet.</td>
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
      )}
    </>
  );
}
