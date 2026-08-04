import { Link } from "react-router";

const topics = [
  {
    title: "Getting started",
    description: "Sign in, choose a workspace, and understand the Loop navigation.",
    to: "/",
    action: "Open Overview"
  },
  {
    title: "Contacts and properties",
    description: "Create, search, edit, archive, and extend contact records with custom fields.",
    to: "/contacts",
    action: "Open Contacts"
  },
  {
    title: "Companies",
    description: "Manage company records, search by name or domain, and review associated contacts.",
    to: "/companies",
    action: "Open Companies"
  },
  {
    title: "Importing data",
    description: "Upload contact or company CSV files and monitor background import jobs.",
    to: "/import",
    action: "Open Import"
  },
  {
    title: "Segments",
    description: "Build reusable audiences from core contact fields and custom properties.",
    to: "/segments",
    action: "Open Segments"
  },
  {
    title: "Campaigns",
    description: "Create drafts, preview content, request approval, approve, and send campaigns.",
    to: "/campaigns",
    action: "Open Campaigns"
  },
  {
    title: "Forms and workflows",
    description: "Collect contact information and configure automated marketing actions.",
    to: "/forms",
    action: "Open Forms"
  },
  {
    title: "Agents and API access",
    description: "Create scoped machine credentials and manage integration access securely.",
    to: "/agents",
    action: "Open Agents"
  },
  {
    title: "Deliverability and tracking",
    description: "Review email health and use your personal BCC address to record email activity.",
    to: "/deliverability",
    action: "Open Deliverability"
  },
  {
    title: "Settings and team access",
    description: "Invite members, manage roles, and find your personal email tracking address.",
    to: "/settings",
    action: "Open Settings"
  },
  {
    title: "Billing",
    description: "View subscription status, complete checkout, restart an expired subscription, or manage billing.",
    to: "/billing",
    action: "Open Billing"
  }
] as const;

export function HelpPage() {
  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Support</p>
          <h1>Help</h1>
        </div>
      </header>

      <section className="help-intro panel">
        <h2>Make the most of Twiniti Loop</h2>
        <p className="muted">
          Use these guides to manage your CRM data, build audiences, and run marketing
          operations. Choose a topic below to jump directly to the relevant workspace.
        </p>
      </section>

      <section className="help-grid" aria-label="Help topics">
        {topics.map((topic) => (
          <article className="help-card" key={topic.title}>
            <div>
              <h3>{topic.title}</h3>
              <p>{topic.description}</p>
            </div>
            <Link className="quiet" to={topic.to}>
              {topic.action} →
            </Link>
          </article>
        ))}
      </section>

      <section className="help-note panel">
        <p className="eyebrow">Good to know</p>
        <p className="muted">
          Imports run in the background, campaign sending is approval-gated, and workspace
          data belongs to the company selected for the current session.
        </p>
      </section>
    </>
  );
}

