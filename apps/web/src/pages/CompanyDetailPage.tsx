import { Link, useParams } from "react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type CompanyContact = {
  id: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  lifecycleStage: string | null;
};

type CompanyDetail = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  lifecycleStage?: string | null;
  properties: Record<string, unknown>;
  contacts: CompanyContact[];
};

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api(`/api/v1/companies/${id}`)
      .then((res) => setCompany(res.data as CompanyDetail))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load company"));
  }, [id]);

  if (!company && !error) {
    return <div className="banner info">Loading company…</div>;
  }

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>{company?.name ?? "Company"}</h1>
        </div>
        <Link className="quiet" to="/companies">
          Back to companies
        </Link>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      {company ? (
        <>
          <section className="panel">
            <p className="eyebrow">Company details</p>
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr>
                    <th>Name</th>
                    <td>{company.name}</td>
                  </tr>
                  <tr>
                    <th>Domain</th>
                    <td>{company.domain ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>Industry</th>
                    <td>{company.industry ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>Lifecycle stage</th>
                    <td>{company.lifecycleStage ?? "—"}</td>
                  </tr>
                  {Object.entries(company.properties ?? {}).map(([key, value]) => (
                    <tr key={key}>
                      <th>{key}</th>
                      <td>{value == null || value === "" ? "—" : String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" style={{ marginTop: 16 }}>
            <p className="eyebrow">Associated contacts</p>
            <h3>Contacts at this company</h3>
            {company.contacts.length === 0 ? (
              <p className="muted">No contacts are associated with this company yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Lifecycle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.contacts.map((contact) => (
                      <tr key={contact.id}>
                        <td>
                          <Link to={`/contacts/${contact.id}`}>{contact.email}</Link>
                        </td>
                        <td>{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</td>
                        <td>{contact.phone ?? "—"}</td>
                        <td>{contact.lifecycleStage ?? "—"}</td>
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
