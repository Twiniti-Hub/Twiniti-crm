# Relationship Steward Agent Build Plan

## Document control

- Linear: TWI-413
- Planning baseline: `origin/development` at `734ab01656bfecb96cb58a5a0443a053bd32ea3b`
- Confirmed product version: `0.10.55`
- Delivery: additive, development-first pull requests; this planning change does not bump the product version
- Dependency: [Digital Workers Platform Build Plan](digital-workers-platform-plan.md)

## Outcome

Build a supervised Relationship Steward that continuously turns CRM history into a current, evidence-backed view of each important relationship. It should identify material changes, recommend a next action, prepare a draft when useful, and learn from the human decision and eventual outcome.

The initial release is successful when a user can open an attention queue, understand why a relationship needs attention, inspect the supporting CRM evidence, and approve, edit, dismiss, or defer a recommendation without allowing the model to send an external communication on its own.

## Product principles

1. Evidence before assertion. Every generated fact, signal, and recommendation links to CRM records or customer events.
2. Freshness is visible. Summaries show their source watermark and generation time; stale summaries are never presented as current.
3. Humans own consequential action. The first release observes, recommends, and drafts. It does not send messages or make destructive changes.
4. Outcomes matter more than activity. Acceptance, correction, execution, and relationship outcome are captured as feedback.
5. CRM remains available without AI. Model or entitlement failures leave contacts, companies, timelines, and manual workflows usable.
6. Tenant, consent, suppression, scope, billing, and regional boundaries are enforced by deterministic services outside the model.

## Current Development foundations to reuse

| Existing capability | Reuse |
| --- | --- |
| `contacts`, `companies`, associations, properties and history | Relationship subjects and verified structured facts |
| `customer_events`, email activities and contact timeline | Evidence stream and incremental analysis watermark |
| `jobs` and `outbox_events` | Durable refresh and action-execution triggers |
| `audit_events` | Immutable record of generation, decisions, and execution |
| Agent identities and scoped HTTPS MCP | Authenticated machine access; do not treat credentials as worker definitions |
| Campaign approvals, subscription types, subscriptions and suppressions | Proven pattern and hard guardrails for communication |
| Workflows and workflow runs | Existing deterministic automation remains separate from agent reasoning |
| License_API-backed agent access | Starting point for separate AI entitlement and usage decisions |

The current MCP surface has eleven CRM tools. The Steward-specific read and decision tools below are additive; existing tool contracts remain stable.

## Scope

### First usable release

- Contact and company relationship profiles with concise summary, health, freshness, important facts, open signals, and recommended next action.
- An organization attention queue ranked by urgency, value, confidence, and staleness.
- Incremental refresh on relevant customer events plus a bounded scheduled sweep.
- Evidence drawer showing the exact records and events used.
- Approve, edit, dismiss, defer, and mark-complete decisions.
- Draft creation for internal tasks or an email/campaign draft; no autonomous external send.
- Audit, usage, model/prompt version, latency, and outcome feedback.
- Shadow mode and organization feature controls.

### Explicitly out of scope

- Autonomous email, SMS, campaign, deal, or financial actions.
- Web research about a person without a separately approved source and privacy policy.
- Replacing existing workflows or campaign approval rules.
- A single opaque relationship score. Health must expose its contributing signals.
- Cross-organization learning from raw customer data.

## User journey

1. A user marks a contact/company as priority, or the system includes it under an organization policy.
2. New CRM events enqueue an idempotent refresh after a debounce window.
3. The worker assembles an organization-scoped evidence packet, then generates a typed analysis.
4. Deterministic validation rejects missing citations, inaccessible sources, invalid actions, stale input, or policy violations.
5. The current profile and any material signal appear in the attention queue.
6. The user inspects evidence and approves, edits, dismisses, or defers the proposal.
7. Approved internal actions execute idempotently. Communication remains a draft that follows existing consent, suppression, and approval flows.
8. The system records the decision and later outcome for evaluation.

## Data design

All tables include `organization_id`, timestamps, foreign keys, organization-scoped indexes, and RLS consistent with existing schema patterns. Use forward-only regional migrations and register them in the canonical migration manifest.

### `relationship_profiles`

- `id`, `organization_id`
- exactly one of `contact_id` or `company_id`
- `priority`: `standard | important | strategic`
- `summary`, `health`: `strong | stable | watch | at_risk | unknown`
- `health_reasons` JSONB with typed factor, direction, evidence references, and confidence
- `next_action_summary`, `next_action_proposal_id`
- `source_watermark`, `analysis_version`, `model_profile`, `prompt_version`
- `generated_at`, `expires_at`, `last_material_change_at`, `version`
- unique `(organization_id, contact_id)` and `(organization_id, company_id)` partial indexes

### `relationship_facts`

- subject reference, `fact_type`, typed `value` JSONB
- `assertion`: `verified | inferred | disputed`
- `confidence`, `sensitivity`, `valid_from`, `valid_to`
- `evidence_refs` JSONB containing allowed source type/id and event time
- `analysis_version`; supersede rather than silently overwrite

### `relationship_signals`

- subject reference, `signal_type`, `severity`, title, explanation
- evidence references and confidence
- `status`: `open | deferred | dismissed | actioned | expired`
- `dedupe_key`, `detected_at`, `expires_at`, decision metadata
- unique `(organization_id, dedupe_key)`

### Shared control-plane records

Use the Digital Workers platform's `digital_workers`, `worker_missions`, `worker_runs`, `worker_run_steps`, `action_proposals`, `approvals`, `worker_evaluations`, and `ai_usage_ledger`. Do not create Steward-only run, approval, or cost tables.

## Typed analysis contract

The model returns structured data that is validated before persistence:

```ts
type RelationshipAnalysis = {
  summary: string;
  health: "strong" | "stable" | "watch" | "at_risk" | "unknown";
  healthReasons: Array<{
    reason: string;
    direction: "positive" | "neutral" | "negative";
    evidenceRefs: string[];
    confidence: number;
  }>;
  facts: Array<{
    type: string;
    value: unknown;
    assertion: "verified" | "inferred";
    evidenceRefs: string[];
    confidence: number;
  }>;
  signals: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    explanation: string;
    evidenceRefs: string[];
    expiresAt?: string;
  }>;
  proposedAction?: {
    type: "create_task" | "update_internal_note" | "draft_email" | "draft_campaign";
    rationale: string;
    evidenceRefs: string[];
    payload: unknown;
  };
};
```

Validation must prove that every evidence reference exists, belongs to the organization and subject, was included in the prompt packet, and is not newer than the recorded source watermark. Unsupported text is rejected or clearly labelled as inference.

## Service and API surface

Implement domain services in a dedicated package or API module rather than embedding model calls in route handlers.

- `GET /api/v1/relationship-steward/queue` — cursor-paged, filterable attention items.
- `GET /api/v1/relationship-steward/contacts/:id` and `/companies/:id` — current profile and evidence metadata.
- `POST /api/v1/relationship-steward/contacts/:id/refresh` and company equivalent — idempotent manual refresh with rate/budget checks.
- `POST /api/v1/action-proposals/:id/approve|reject|defer` — optimistic version and content-hash checks.
- `POST /api/v1/action-proposals/:id/execute` — only for approved, unexpired, policy-allowed actions.
- `POST /api/v1/relationship-steward/:subjectType/:subjectId/feedback` — correction and usefulness feedback.

Add MCP tools only after the HTTP contracts are stable:

- `get_relationship_brief`
- `list_relationship_signals`
- `list_relationship_action_proposals`
- `decide_relationship_action_proposal`

Read tools require a new `relationships:read` scope. Decisions require `relationships:decide`; draft creation uses the relevant existing CRM scope as well. No tool may broaden the authenticated actor's access.

## Refresh and execution flow

```text
customer event/outbox or scheduled sweep
  -> dedupe by org + subject + source watermark + analysis version
  -> entitlement, policy and budget decision
  -> snapshot evidence in one organization-scoped read
  -> typed model analysis
  -> citation, schema, freshness and policy validation
  -> transactional profile/signal/proposal update + audit
  -> attention queue
  -> human decision
  -> idempotent internal action or existing approved draft flow
  -> outcome/evaluation
```

- Debounce bursts of events per subject.
- A retry reuses the same run and idempotency key; it must not create duplicate proposals.
- Store content hashes on proposed payloads. Editing invalidates prior approval.
- Lease long-running work, heartbeat it, cap retries, and surface dead-lettered work to operators.
- If the model, entitlement service, or a dependency is unavailable, leave the prior profile visible with a stale/degraded marker and retry safely.

## Experience

### Attention queue

Add `/attention` as the primary operational view with filters for priority, severity, age, owner, relationship type, and decision status. Each item shows what changed, why it matters, evidence count, confidence, recommended action, freshness, and the responsible worker/run.

### Contact and company pages

Add a Relationship panel containing summary, health factors, verified/inferred facts, open signals, next action, freshness, and history. Evidence opens in context. Corrections must be easy and feed evaluation without rewriting source CRM records.

### Decision experience

Show the exact action payload and risk tier. Allow edit, approve, reject, defer, and add rationale. Explain which actions remain drafts and which can execute internally. Preserve keyboard access, mobile behavior, loading/error states, and reduced motion conventions.

## Security and governance gates

- Enforce organization scoping in API queries and RLS; add negative cross-tenant tests.
- Redact or exclude secrets, credentials, unrelated contacts, and disallowed sensitive properties before model calls.
- Record model profile, prompt version, evidence identifiers, decision, actor, and execution result in audit/run records.
- Apply consent and suppression at draft preview and again at any later send boundary.
- Fail closed on uncertain permissions or approval state.
- Separate CRM access entitlement from AI generation entitlement. Cache only signed/authoritative decisions for their bounded TTL.
- Apply per-organization, worker, mission, and run budgets before model invocation.
- Provide retention/deletion behavior for generated profiles, run inputs/outputs, and memories.

## Evaluation and operating metrics

Create a versioned evaluation fixture set using synthetic or approved anonymized CRM histories. Merge gates cover:

- evidence precision and unsupported-claim rate
- stale-input and wrong-subject rejection
- next-action validity and policy classification
- consent/suppression and cross-tenant isolation
- duplicate-proposal prevention under retry
- deterministic degraded behavior when AI or License_API is unavailable

Production indicators:

- priority relationships with a fresh profile
- median signal-to-human-decision time
- accepted or edited proposal rate
- completed outcomes per accepted proposal
- correction, dismissal, reversal, and stale-profile rates
- cost and latency per trusted outcome
- consent, suppression, tenant, or approval violations (target: zero)

## Sequenced delivery

### RS-0 — Product contract and fixtures

**Depends on:** none. **Deliverable:** contracts, feature flags, synthetic evidence fixtures, threat model, evaluation rubric.

Acceptance: product language distinguishes verified facts from inference; risk tiers and no-send boundary are documented; fixtures include sparse, stale, contradictory, suppressed, and cross-tenant cases.

### RS-1 — Digital Worker thin slice

**Depends on:** Digital Workers DW-0 through DW-3. **Deliverable:** registered Steward worker, mission/run lifecycle, policy decision, usage ledger, generalized proposal/approval records.

Acceptance: a no-model fixture run traverses the full lifecycle idempotently, produces an audit trail, and cannot exceed budget or scope.

### RS-2 — Relationship data and evidence assembly

**Depends on:** RS-0, RS-1. **Deliverable:** migrations, repositories, subject-scoped evidence assembler, watermarking, refresh jobs.

Acceptance: incremental refresh dedupes event bursts; evidence cannot cross tenant/subject boundaries; profile history is concurrency safe; regional migration checks pass.

### RS-3 — Analysis and validation

**Depends on:** RS-2 and Digital Workers model gateway. **Deliverable:** versioned prompt, typed response, citation/freshness/policy validators, degraded behavior.

Acceptance: evaluation thresholds are defined and met; unsupported citations never reach the current profile; retries create no duplicates; CRM works with the model disabled.

### RS-4 — Attention and relationship UI

**Depends on:** RS-3. **Deliverable:** queue, relationship panels, evidence drawer, decision controls, accessible states.

Acceptance: user can complete the full review journey on desktop and mobile; stale/degraded/inferred states are explicit; optimistic conflicts recover without lost decisions.

### RS-5 — Draft and internal action execution

**Depends on:** RS-4 and Digital Workers approval/execution engine. **Deliverable:** internal task/note execution and communication draft hand-off.

Acceptance: content hash, approval expiry, scope, consent and suppression checks are enforced; no path sends externally; execution is idempotent and audited.

### RS-6 — Shadow rollout and learning loop

**Depends on:** RS-5. **Deliverable:** shadow mode, organization allowlist, dashboards, feedback/outcome capture, operator runbook.

Acceptance: two-week shadow cohort meets agreed quality/cost thresholds with zero policy incidents before recommendations are enabled; rollback disables generation without hiding CRM data.

## Coding-agent work packet template

Create one Linear child issue and one `codex/<linear-id>-<slug>` branch per milestone. Give the coding agent this packet, replacing bracketed values:

```text
Implement Relationship Steward milestone [RS-N] from
docs/architecture/relationship-steward-agent-plan.md.

Start by confirming this repository and a clean branch based on the latest
origin/development. Read AGENTS.md, the release policy, and the linked Linear
issue. Do not expand into later milestones.

Required evidence:
- migration/RLS and cross-tenant tests for data changes
- unit/integration tests for contracts, state transitions and idempotency
- UI accessibility and failure-state tests for UI changes
- audit, entitlement, scope, budget and degraded-mode verification
- code, API/agent, user documentation and CHANGELOG updates

Report changed contracts, commands run, residual risks, rollout/rollback notes,
and update Linear with status and an activity summary. Open a PR to development
only under the repository's required bot identity and review policy.
```

## Release and rollback

- Keep the feature disabled by default, then enable shadow mode per organization.
- Apply additive migrations region by region through the protected migration workflow.
- Promotion follows feature branch → `development` → exact deployed SHA verification → later `development` to `production` PR.
- Rollback disables scheduling, model calls, and proposal execution. Generated records remain readable/auditable until normal retention removes them; core CRM paths remain independent.

