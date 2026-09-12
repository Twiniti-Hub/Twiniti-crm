import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Worker = { id: string; name: string; role: string; status: string; autonomyLevel: string; updatedAt: string };
type Run = { id: string; status: string; trigger: string; createdAt: string };
type Proposal = { id: string; actionType: string; riskTier: string; status: string; expiresAt: string };
type Evaluation = { id: string; fixtureKey: string; rubricVersion: string; passed: boolean; createdAt: string };

export function DigitalWorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api("/api/v1/digital-workers"),
      api("/api/v1/worker-runs"),
      api("/api/v1/action-proposals"),
      api("/api/v1/worker-evaluations")
    ]).then(([workerRes, runRes, proposalRes, evaluationRes]) => {
      setWorkers((workerRes.data ?? []) as Worker[]);
      setRuns((runRes.data ?? []) as Run[]);
      setProposals((proposalRes.data ?? []) as Proposal[]);
      setEvaluations((evaluationRes.data ?? []) as Evaluation[]);
    }).catch((err) => setError(err instanceof Error ? err.message : "Failed to load digital workers"));
  }, []);

  const pendingApprovals = proposals.filter((proposal) => proposal.status === "proposed").length;
  const passedEvaluations = evaluations.filter((evaluation) => evaluation.passed).length;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Agent workforce</p>
          <h1>Digital workers</h1>
          <p className="muted">Supervise roles, missions, runs, approvals, budgets, and evaluation evidence.</p>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <section className="metrics">
        <article><span className="metric-label">Workers</span><strong>{workers.length}</strong><small>Registered in this workspace</small></article>
        <article><span className="metric-label">Recent runs</span><strong>{runs.length}</strong><small>Most recent 100 runs</small></article>
        <article><span className="metric-label">Awaiting approval</span><strong>{pendingApprovals}</strong><small>Hash-bound proposals</small></article>
        <article><span className="metric-label">Passed evaluations</span><strong>{passedEvaluations}</strong><small>Versioned fixture results</small></article>
      </section>
      <section className="content-grid">
        <article className="help-card">
          <div><p className="eyebrow">Workforce directory</p><h2>Workers</h2></div>
          {workers.length ? workers.map((worker) => (
            <div className="list-row" key={worker.id}>
              <div><strong>{worker.name}</strong><small>{worker.role} · {worker.autonomyLevel}</small></div>
              <span className={`status-pill ${worker.status}`}>{worker.status}</span>
            </div>
          )) : <p className="muted">No digital workers are active yet. The Relationship Steward will appear here when registered.</p>}
        </article>
        <article className="help-card">
          <div><p className="eyebrow">Supervision queue</p><h2>Action proposals</h2></div>
          {proposals.length ? proposals.slice(0, 6).map((proposal) => (
            <div className="list-row" key={proposal.id}>
              <div><strong>{proposal.actionType}</strong><small>{proposal.riskTier} · expires {new Date(proposal.expiresAt).toLocaleString()}</small></div>
              <span className={`status-pill ${proposal.status}`}>{proposal.status}</span>
            </div>
          )) : <p className="muted">No action proposals require review.</p>}
        </article>
      </section>
      <section className="content-grid">
        <article className="help-card"><p className="eyebrow">Run health</p><h2>Latest runs</h2>{runs.length ? runs.slice(0, 6).map((run) => <div className="list-row" key={run.id}><div><strong>{run.trigger}</strong><small>{new Date(run.createdAt).toLocaleString()}</small></div><span className={`status-pill ${run.status}`}>{run.status}</span></div>) : <p className="muted">Runs will appear when a mission is dispatched.</p>}</article>
        <article className="help-card"><p className="eyebrow">Quality loop</p><h2>Evaluations</h2>{evaluations.length ? evaluations.slice(0, 6).map((evaluation) => <div className="list-row" key={evaluation.id}><div><strong>{evaluation.fixtureKey}</strong><small>{evaluation.rubricVersion}</small></div><span className={`status-pill ${evaluation.passed ? "passed" : "failed"}`}>{evaluation.passed ? "passed" : "failed"}</span></div>) : <p className="muted">Evaluation results will appear after fixture or simulation runs.</p>}</article>
      </section>
    </>
  );
}
