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
    title: "Agent access",
    description: "Create scoped machine credentials and manage integration access securely.",
    to: "/agents",
    action: "Open Agent access"
  },
  {
    title: "Deliverability and tracking",
    description: "Review email health and set up Resend so personal BCC addresses log on contact timelines.",
    to: "/deliverability",
    action: "Open Deliverability"
  },
  {
    title: "Settings and team access",
    description: "Invite members, manage Resend domains and webhooks, and copy your personal BCC address.",
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
          operations. Sign in through the canonical Loop URL; choose a topic below to jump
          directly to the relevant workspace.
        </p>
      </section>

      <section className="help-note panel" aria-labelledby="help-email-heading">
        <p className="eyebrow">Email with Resend</p>
        <h2 id="help-email-heading">BCC tracking and campaign delivery</h2>
        <p className="muted">
          Loop sends campaigns and logs personal BCC email through your organization&apos;s
          Resend domain. Company admins complete setup once; every member then copies their
          own BCC address from Settings.
        </p>
        <ol className="help-steps">
          <li>
            <strong>Verify a domain in Resend</strong> and enable <strong>Receiving</strong>{" "}
            (publish the MX records Resend shows).
          </li>
          <li>
            In <Link to="/settings">Settings → Email delivery</Link>, add the domain, API key,
            and From address, then set it as the <strong>default</strong>.
          </li>
          <li>
            Copy the <strong>exact</strong> webhook URL from the domain table into Resend
            (include <code>?domain=…</code>). Subscribe to <code>email.received</code>.
            Do not use the Loop homepage URL.
          </li>
          <li>
            Paste that webhook&apos;s signing secret (<code>whsec_…</code>) back into
            Settings for the same domain. A wrong secret returns HTTP 401 and BCC mail
            never logs.
          </li>
          <li>
            Copy your personal BCC address under Settings → Email tracking. BCC it on a
            real customer email, then open the contact — look for an <strong>Email</strong>{" "}
            card with <strong>Open email</strong>, not an Imported marketing summary.
          </li>
        </ol>
        <p className="muted">
          Review health under <Link to="/deliverability">Deliverability</Link>. Imported
          HubSpot marketing cards are historical stats only; they are not openable BCC
          messages.
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
          data belongs to the company selected for the current session. New workspaces choose
          their country during signup; Loop routes each workspace to its regional data service.
        </p>
      </section>
    </>
  );
}
