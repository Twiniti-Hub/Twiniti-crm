import { useEffect, useState } from "react";
import { formatCount } from "@twiniti/ui";
import { api } from "../lib/api";

type Deliverability = {
  recentEvents: number;
  suppressions: number;
  fromEmail?: string;
  bounceRateHint?: number;
  complaintRateHint?: number;
};

export function DeliverabilityPage() {
  const [data, setData] = useState<Deliverability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/api/v1/deliverability")
      .then((res) => setData(res.data as Deliverability))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load deliverability"));
  }, []);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Email health</p>
          <h1>Deliverability</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <section className="metrics">
        <article>
          <span className="metric-label">Recent events</span>
          <strong>{data ? formatCount(data.recentEvents) : "—"}</strong>
          <small>Last 100 email events</small>
        </article>
        <article>
          <span className="metric-label">Suppressions</span>
          <strong>{data ? formatCount(data.suppressions) : "—"}</strong>
          <small>Hard bounces / complaints / unsubscribes</small>
        </article>
        <article>
          <span className="metric-label">Hints</span>
          <strong>
            {data
              ? `${formatCount(data.bounceRateHint ?? 0)} / ${formatCount(data.complaintRateHint ?? 0)}`
              : "—"}
          </strong>
          <small>Bounce / complaint counts in sample</small>
        </article>
      </section>
      {data?.fromEmail ? <p className="muted">From: {data.fromEmail}</p> : null}
    </>
  );
}
