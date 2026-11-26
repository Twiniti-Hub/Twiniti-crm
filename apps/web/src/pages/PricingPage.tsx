import { Link } from "react-router";
import { Brand } from "../components/Brand";
import { PAGE_META, usePageMeta } from "../lib/pageMeta";

const CONTACT_SYNC_ENABLED = import.meta.env.VITE_CONTACT_SYNC_ENABLED === "true";

export function PricingPage() {
  usePageMeta(PAGE_META.pricing.title, PAGE_META.pricing.description, PAGE_META.pricing);

  return (
    <div className="landing">
      <header className="landing-bar">
        <Brand />
        <div className="landing-actions">
          <Link className="secondary" to="/sign-in">
            Sign in
          </Link>
          <Link className="primary" to="/sign-up">
            Start free
          </Link>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="pricing-title">
        <p className="eyebrow">Loop pricing</p>
        <h1 id="pricing-title">Simple pricing, per workspace.</h1>
        <p className="landing-lede">
          Try Loop free for 7 days. Then pick the workspace that fits how you work.
        </p>
      </section>

      <section className="landing-features pricing-grid" aria-label="Plans">
        <article className="pricing-card">
          <h2>Personal</h2>
          <p className="pricing-amount">
            <strong>$9</strong>/month per workspace, after 7 days free
          </p>
          <ul className="pricing-list">
            <li>Just for you. Personal workspaces don&apos;t take invites.</li>
            <li>People, companies, custom fields and activity, in one record per customer</li>
            <li>Upload your contacts from a CSV file</li>
            {CONTACT_SYNC_ENABLED ? (
              <li>Google and iCloud contact sync (read-only)</li>
            ) : null}
            <li>Log email by BCC once your email domain is connected</li>
            <li>The Web Visitors module, included</li>
          </ul>
          <Link className="primary" to="/sign-up">
            Start free
          </Link>
        </article>

        <article className="pricing-card pricing-card-elevated">
          <h2>Organization</h2>
          <p className="pricing-amount">
            <strong>$29</strong>/month per workspace, after 7 days free
          </p>
          <ul className="pricing-list">
            <li>For a team, with members and invites.</li>
            <li>
              {CONTACT_SYNC_ENABLED
                ? "Everything in Personal except Google and iCloud contact sync, plus:"
                : "Everything in Personal, plus:"}
            </li>
            <li>Segments, forms and workflows</li>
            <li>Campaigns, with a second check: a different admin approves each one before it sends</li>
            <li>Digital workforce: AI agents help with contacts and campaign drafts</li>
            <li>Email deliverability controls</li>
          </ul>
          <Link className="primary" to="/sign-up">
            Start free
          </Link>
        </article>
      </section>

      <section className="landing-features" aria-label="Pricing notes">
        <p>
          You can have both a personal and an Organization workspace and switch between them.
        </p>
        <p>
          Your data stays in your region. Choose your country at sign-up, and Loop places your workspace
          in its US, UK or EU region.
        </p>
      </section>

      <section className="landing-features" aria-label="Pricing FAQ">
        <h2>What does Loop cost?</h2>
        <p>Personal is $9/mo and Organization is $29/mo after the 7-day trial.</p>
        <h2>Personal vs Organization</h2>
        <p>
          A personal workspace is just for you. An Organization workspace has members and invites, plus
          campaigns.
        </p>
        <h2>Where is my data stored?</h2>
        <p>
          You choose your country when you sign up. UK workspaces go to Loop&apos;s UK region, EU countries to
          its EU region, and every other country to its US region.
        </p>
      </section>
    </div>
  );
}