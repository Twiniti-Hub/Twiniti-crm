import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Signal = { id: string; severity: string; title: string; explanation: string; confidence: number; evidenceRefs: unknown[] };
type Profile = { id: string; priority: string; summary: string; health: string; healthReasons: unknown[]; nextActionSummary: string | null; generatedAt: string | null; expiresAt: string | null };
type QueueItem = { profile: Profile; signals: Signal[] };

export function AttentionPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/api/v1/relationship-steward/queue")
      .then((res) => setItems((res.data ?? []) as QueueItem[]))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load attention queue"));
  }, []);

  const atRisk = items.filter((item) => item.profile.health === "at_risk").length;
  const openSignals = items.reduce((total, item) => total + item.signals.length, 0);
  const stale = items.filter((item) => item.profile.expiresAt && new Date(item.profile.expiresAt).getTime() < Date.now()).length;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Relationship Steward</p>
          <h1>Attention</h1>
          <p className="muted">Evidence-backed relationship priorities for human review. Draft-only during supervised rollout.</p>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <section className="metrics">
        <article><span className="metric-label">Profiles</span><strong>{items.length}</strong><small>Tracked relationships</small></article>
        <article><span className="metric-label">Open signals</span><strong>{openSignals}</strong><small>Requires attention</small></article>
        <article><span className="metric-label">At risk</span><strong>{atRisk}</strong><small>Health marked at risk</small></article>
        <article><span className="metric-label">Stale</span><strong>{stale}</strong><small>Past freshness window</small></article>
      </section>
      <section className="content-grid">
        {items.length ? items.map(({ profile, signals }) => (
          <article className="help-card attention-card" key={profile.id}>
            <div className="attention-card-header">
              <div><p className="eyebrow">{profile.priority}</p><h2>{profile.health.replace("_", " ")}</h2></div>
              <span className={`status-pill ${profile.health}`}>{signals.length ? `${signals.length} signal${signals.length === 1 ? "" : "s"}` : "clear"}</span>
            </div>
            <p>{profile.summary || "No relationship summary has been generated yet."}</p>
            {profile.nextActionSummary ? <p className="muted"><strong>Suggested next action:</strong> {profile.nextActionSummary}</p> : null}
            {signals.length ? <div className="signal-list">{signals.slice(0, 4).map((signal) => <div className="signal-row" key={signal.id}><div><strong>{signal.title}</strong><small>{signal.explanation}</small></div><span className={`status-pill ${signal.severity}`}>{signal.confidence}%</span></div>)}</div> : <p className="muted">No open signals. Continue monitoring.</p>}
            <small className="muted">{profile.generatedAt ? `Analysed ${new Date(profile.generatedAt).toLocaleString()}` : "Awaiting analysis"} · {profile.healthReasons.length} evidence-backed reason{profile.healthReasons.length === 1 ? "" : "s"}</small>
          </article>
        )) : <article className="help-card"><p className="eyebrow">Supervised rollout</p><h2>No attention items yet</h2><p className="muted">Relationship profiles will appear here once the Steward has analysed CRM activity. External messages remain disabled until a human approves a proposal.</p></article>}
      </section>
    </>
  );
}
