import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  lifecycleStage: string | null;
};

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api("/api/v1/contacts");
    setContacts((res.data ?? []) as Contact[]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load contacts"));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/contacts", {
        method: "POST",
        body: JSON.stringify({
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined
        })
      });
      setEmail("");
      setFirstName("");
      setLastName("");
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
          <h1>Contacts</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <form className="stack-form" onSubmit={onCreate}>
        <div className="form-row">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            First name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label>
            Last name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
        </div>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create contact"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>{contact.email}</td>
                <td>{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</td>
                <td>{contact.lifecycleStage ?? "—"}</td>
              </tr>
            ))}
            {!contacts.length ? (
              <tr>
                <td colSpan={3}>No contacts yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
