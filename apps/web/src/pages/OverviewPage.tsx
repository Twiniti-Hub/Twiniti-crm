import { useEffect, useState } from "react";
import { formatCount } from "@twiniti/ui";
import { api } from "../lib/api";

type Overview = {
  contacts: number;
  campaigns: number;
  segments: number;
  attributionModel?: string;
  freshness?: string;
  definition?: string;
};

type Me = {
  type: string;
  id: string;
  organizationId: string;
  role?: string;
  email?: string | null;
  displayName?: string | null;
};

export function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [overviewRes, meRes] = await Promise.all([
          api("/api/v1/reports/overview"),
          api("/api/v1/me")
        ]);
        if (cancelled) return;
        setOverview(overviewRes.data as Overview);
        setMe(meRes.data as Me);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load overview");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Marketing workspace</p>
          <h1>Overview</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <section className="metrics">
        <article>
          <span className="metric-label">Total contacts</span>
          <strong>{overview ? formatCount(overview.contacts) : "—"}</strong>
          <small>{me ? `${me.displayName ?? me.email ?? me.type}` : "Loading actor…"}</small>
        </article>
        <article>
          <span className="metric-label">Active segments</span>
          <strong>{overview ? formatCount(overview.segments) : "—"}</strong>
          <small>{overview?.definition ?? "Segment counts"}</small>
        </article>
        <article>
          <span className="metric-label">Campaigns</span>
          <strong>{overview ? formatCount(overview.campaigns) : "—"}</strong>
          <small>{overview?.attributionModel ?? "last_touch"}</small>
        </article>
      </section>
      {overview?.freshness ? (
        <p className="muted">Freshness: {new Date(overview.freshness).toLocaleString()}</p>
      ) : null}
    </>
  );
}
