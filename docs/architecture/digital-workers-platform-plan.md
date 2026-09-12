# Digital Workers Platform Build Plan

## Document control

- Linear: TWI-413
- Planning baseline: `origin/development` at `734ab01656bfecb96cb58a5a0443a053bd32ea3b`
- Confirmed product version: `0.10.55`
- Delivery: additive, development-first pull requests; this planning change does not bump the product version
- Build status: DW-1 through DW-8 registry, run, tool/policy, approval, entitlement, usage, model-gateway, memory, evaluation, simulation, supervisor UI, Relationship Steward attention, and short-lived run credential foundations are now started on the feature branch; side-effect execution and autonomous external sending remain disabled
- First reference worker: [Relationship Steward Agent Build Plan](relationship-steward-agent-plan.md)

## Outcome

Turn Twiniti's current agent credentials into a managed workforce platform. A digital worker is a named, owned, policy-bound role that receives missions, plans and executes typed steps, requests approval when required, stays within scope and budget, and produces a replayable record that can be evaluated.

Agent identity remains the authentication principal. A digital worker is the operating definition. Keeping these separate lets credentials rotate or become short-lived without losing the worker's role, policy, history, ownership, or evaluations.

## Platform principles

1. Deterministic control plane, probabilistic reasoning plane. Code controls permissions, state, budgets, approvals, idempotency, and execution.
2. Least authority by construction. The effective permission is the intersection of user/worker policy, agent scopes, tool policy, organization entitlement, action risk, and approval.
3. Durable, resumable work. Every mission, run, and step has an explicit state and idempotency key.
4. Model and provider independence. Core CRM never depends on a specific model provider being available.
5. Observable decisions. Inputs, evidence, prompt/model versions, tool results, costs, decisions, and outcomes are traceable with appropriate redaction.
6. Autonomy is earned per action class. A worker can be autonomous for low-risk reads while requiring human approval for communication or material writes.
7. Regional and tenant boundaries are invariant. Worker execution does not bypass the rules already applied to humans and API agents.

## Current Development foundations and gaps

| Foundation | Keep and extend | Gap to close |
| --- | --- | --- |
| `agent_identities` and bearer scopes | Authentication, revocation, organization boundary | No role, owner, mission, policy, budget, or performance definition |
| HTTPS MCP with eleven scoped tools | Initial tool adapter and external agent access | No worker-aware tool registry, risk classification, or run context |
| `jobs`, claim/complete helpers and `outbox_events` | Durable queue and transactional triggers | No general run/step lifecycle, leases, cancellation, approval pause, or replay |
| `workflow_runs` | Reference for deterministic automation records | Workflow runs do not represent agent reasoning/tool steps |
| Campaign approvals | Content hash, expiry and human gate pattern | Approval is campaign-specific rather than generalized by action |
| Audit events | Compliance record | Needs correlation with mission/run/step/proposal/evaluation |
| License_API agent access and organization billing | Hard entitlement boundary | AI feature entitlement, budgets, cost ledger, and graceful model failure |

## Scope

### Platform v1

- Worker definition, ownership, status, instruction version, autonomy profile, tool allowlist, and credential binding.
- Mission, run, and step state machines with durable queueing, leases, retries, cancellation, and idempotency.
- Versioned tool registry for internal services, Twiniti MCP, and later approved external MCP servers.
- Central policy decision service and generalized action proposal/approval/execution records.
- Provider-neutral model gateway with typed outputs, usage/cost accounting, timeouts, and circuit breaking.
- Provenance-aware bounded memory.
- Supervisor UI for workers, missions, runs, approvals, budgets, and evaluations.
- Simulation/replay and a versioned evaluation harness.
- Relationship Steward as the first end-to-end worker.

### Not in platform v1

- Unrestricted arbitrary code or shell execution.
- Self-granting scopes, tools, budgets, or autonomy.
- Worker-created workers.
- Autonomous external communication, destructive operations, purchases, or legal commitments.
- Hidden chain-of-thought storage. Persist concise decision rationale and evidence, not private reasoning traces.
- A marketplace for third-party workers or tools.

## Core concepts

- **Agent identity:** revocable organization-scoped machine authentication principal.
- **Digital worker:** named role with owner, instructions, policy, tools, model profile, limits, and lifecycle.
- **Mission:** bounded desired outcome with success criteria, priority, deadline, and budget.
- **Run:** one attempt to complete a mission from a trigger and immutable input snapshot.
- **Step:** typed plan, model, tool, decision, approval, handoff, or completion transition.
- **Action proposal:** exact side effect payload plus content hash, risk, evidence, policy decision, and expiry.
- **Approval:** actor decision over the unchanged proposal.
- **Memory:** bounded, attributable information eligible for later retrieval; never an authority grant.
- **Evaluation:** automated or human score attached to a worker/run/output and rubric version.

## State machines

### Mission

`draft -> active -> completed | cancelled | failed`

An active mission may have several runs, but only one active run for the same mission attempt key.

### Run

`queued -> planning -> running -> awaiting_approval -> running -> succeeded | failed | cancelled | expired`

Only validated transitions are allowed. Approval does not execute an action by itself; it makes the unchanged proposal eligible for a separately authorized execution step.

### Step

`pending -> running -> succeeded | failed | skipped | awaiting_approval | cancelled`

Every side-effect step carries an idempotency key. Workers use leases and heartbeats; an expired lease may be reclaimed without duplicating the side effect.

## Data design

All tables are organization-scoped, use UUIDs and timestamps consistent with the existing schema, and receive RLS plus cross-tenant tests. Large model input/output bodies should use encrypted/object storage when available; database rows keep redacted summaries, hashes, and references.

### `digital_workers`

- `id`, `organization_id`, `name`, `slug`, `description`, `role`
- `owner_user_id`, optional `agent_identity_id`
- `status`: `draft | active | paused | retired`
- `autonomy_level`: `observe | recommend | draft | bounded_execute`
- `instruction_version_id`, `policy_set_id`, `model_profile_id`
- `default_budget` JSONB, `feature_key`, `version`, timestamps
- unique `(organization_id, slug)`

### Versioned configuration

- `worker_instruction_versions`: immutable instructions, input/output schema, author, checksum, change note.
- `worker_policy_sets`: versioned policy document, status and checksum.
- `worker_tool_grants`: worker, tool version, allowed operations, constraints and optional expiry.
- `model_profiles`: provider-neutral alias, capability requirements, fallback profile, timeouts, structured-output settings; provider secrets stay outside rows and prompts.

### Work records

- `worker_missions`: worker, goal, typed input, success criteria, status, priority, deadline, budget, requester and correlation.
- `worker_runs`: mission, attempt, trigger, input snapshot/hash, status, lease/heartbeat, current step, configuration versions, usage/cost totals, timestamps and terminal reason.
- `worker_run_steps`: ordered type, status, tool/model reference, redacted input/output refs and hashes, policy decision, idempotency key, usage, error classification, timestamps.
- `worker_handoffs`: source run/worker, target worker or human queue, contract, reason, status.

### Governance and learning records

- `action_proposals`: run/step, action type, exact payload/ref, content hash, target, risk tier, rationale, evidence, policy snapshot, status and expiry.
- `approvals`: proposal, decision, actor, rationale, proposal hash, decided/expiry times. The approver cannot be the machine principal that proposed the action.
- `worker_memories`: worker/subject scope, content/ref, provenance, confidence, sensitivity, validity, expiry, supersession and retrieval fields.
- `worker_evaluations`: worker/run/output, rubric/version, evaluator type, scores, findings and pass/fail.
- `ai_usage_ledger`: organization, worker, mission/run/step, provider profile, model, tokens/units, estimated/settled cost, entitlement decision, timestamp and idempotency key.

## Control-plane services

### Worker registry

Creates versioned worker definitions and binds them to a revocable agent identity. Activation validates an owner, instruction version, policy set, model profile, tool grants, and budget.

### Mission and run service

Owns all state transitions, creates immutable input snapshots, enqueues work transactionally, handles cancellation/expiry, and exposes replay without re-executing side effects.

### Tool registry and broker

Each tool version declares:

- name, description, JSON input/output schemas and schema hash
- adapter type: internal service, Twiniti MCP, approved external MCP
- required scopes and entitlement
- risk tier and side-effect class
- timeout, retry safety, idempotency support, rate limit and data classification

The broker validates the schema and effective authority before invocation. It injects organization/run context server-side, never accepts organization identity from model output, redacts results before model use, and records a step. Tool descriptions are data, not trusted instructions.

### Policy decision service

Return a typed decision for every model call and tool/action request:

```ts
type PolicyDecision = {
  effect: "allow" | "deny" | "require_approval";
  reasonCodes: string[];
  riskTier: "read" | "internal_write" | "external" | "restricted";
  constraints: Record<string, unknown>;
  policyVersion: string;
  entitlementDecisionRef?: string;
  expiresAt: string;
};
```

Effective authority is the intersection of authenticated actor scopes, worker grants, mission constraints, organization policy, current entitlement, budget, tool requirements, and risk rules. Unknown or unavailable inputs deny consequential actions.

### Proposal, approval, and execution service

- Create proposals only after schema and policy validation.
- Hash canonical action content and expire it after a bounded interval.
- Approval records the exact hash; any edit creates a new version and invalidates approval.
- Execution rechecks scope, entitlement, policy, budget, target state, consent/suppression where relevant, approval, expiry and hash.
- Use an outbox transaction and idempotency key so retry cannot duplicate a side effect.

### Model gateway

- Accept capability/profile, typed input/output schema, classification and budget—not a provider-specific client in domain code.
- Apply timeouts, bounded retries, circuit breakers, fallback only to approved compatible profiles, and structured-output validation.
- Record usage before/after calls and reconcile provider totals without blocking CRM use.
- Keep prompts and instruction versions immutable and testable.
- Do not log secrets, raw credentials, or unrestricted personal data.

### Memory service

Start with explicit SQL retrieval over subject, type, validity, provenance, and sensitivity. Add vector retrieval only after a measured need. A memory is eligible context, not verified truth; retrieval preserves provenance and access checks. Support correction, supersession, expiry, export, and deletion.

## Risk and autonomy model

| Tier | Examples | Default v1 behavior |
| --- | --- | --- |
| Read | Fetch scoped CRM records, calculate summary | Allow when scope, entitlement and budget pass |
| Internal write | Create internal task/note, update non-sensitive derived field | Human approval until a per-action policy earns bounded execution |
| External | Email/campaign draft or send, external API mutation | Draft may be allowed; execution requires human approval and existing consent/suppression gates |
| Restricted | Delete, merge, purchase, permission/billing change, export sensitive bulk data | Deny worker execution in v1 |

Autonomy is configured per action class, never as a single global “autonomous” switch. Promotion requires evaluation history and explicit organization-admin policy change.

## API and MCP boundaries

Initial management APIs:

- `/api/v1/digital-workers` and `/:id/versions|tools|policy|budget`
- `/api/v1/worker-missions` and `/:id/cancel|retry`
- `/api/v1/worker-runs` and `/:id/steps|events|replay`
- `/api/v1/action-proposals` and `/:id/approve|reject|execute`
- `/api/v1/worker-evaluations`

Use cursor pagination and explicit organization-scoped repositories. Management routes require human admin/member permissions appropriate to the operation; worker execution routes require machine scopes and run-bound tokens.

Do not expose a universal `execute_any_tool` MCP function. Publish narrow tools with typed contracts and minimum scopes. Later, issue short-lived, audience-bound credentials per run/tool instead of passing long-lived bearer credentials through worker prompts or external MCP servers.

## Supervisor experience

- `/agents` evolves from credential management into a workforce directory while retaining clear credential controls.
- `/agents/:id` shows role, owner, status, autonomy by action, policy/instruction versions, tools, budget, health, recent missions and evaluations.
- `/missions` shows desired outcomes and progress, not just background jobs.
- `/runs/:id` shows a redacted event timeline: inputs, evidence, plan summary, tool calls, policy decisions, approvals, costs, errors, handoffs and outcome.
- `/approvals` is a unified queue with risk, exact proposed change, evidence, expiry, worker and requester.
- Simulation mode previews policy and tool behavior with no side effects.

Credentials must remain copy-once and revocable. Never display secrets in worker configuration or run history.

## Resilience, billing, and operations

- Separate core CRM entitlement, agent access, and AI generation/action entitlements.
- Cache authoritative entitlement decisions only until their expiry; degraded reads may use an explicitly allowed cache, but consequential actions fail closed.
- Enforce organization, worker, mission, run and call budgets. Reserve budget before calls and settle afterward.
- Classify errors as retryable dependency, rate/budget, policy, validation, cancelled, or permanent business failure.
- Use bounded exponential retry, dead-letter visibility, leases/heartbeats, and operator-safe replay.
- Publish metrics for queue age, active leases, success/failure, approval wait, policy denial, model latency, tokens/cost and trusted outcomes.
- Core CRM endpoints, manual workflows, and campaign operations remain usable during model/provider outages.

## Verification strategy

- State-machine transition and concurrency tests, including lease reclaim and cancellation races.
- Property-based/idempotency tests for repeated trigger, step, approval, execution and webhook delivery.
- Cross-tenant/RLS negative tests on every new repository and route.
- Contract tests for every tool version and model structured output.
- Policy matrix tests over actor scope × worker grant × action risk × approval × entitlement × budget.
- Failure injection for model, entitlement, database, queue, tool timeout and malformed output.
- Replay tests prove side-effect steps are not repeated.
- Browser tests for worker activation, mission/run inspection, approval, conflicts, degraded states and accessibility.
- Security tests for prompt injection in CRM/tool content, secret redaction, SSRF/egress allowlists, and untrusted MCP metadata.

## Sequenced delivery

### DW-0 — Contracts, threat model and architecture decision records

**Deliverable:** concepts, state machines, risk matrix, schema contracts, trust boundaries, feature flags and synthetic evaluation fixtures.

Acceptance: no ambiguous terminal/approval transition; restricted actions are enumerated; retention, regional processing, entitlement, credential and egress boundaries are approved before migrations.

### DW-1 — Worker registry and schema foundation

**Depends on:** DW-0. **Deliverable:** additive migrations, repositories and admin APIs for workers, immutable instructions, policies, tool grants and model profiles.

Acceptance: RLS/cross-tenant tests pass; activation rejects incomplete configuration; agent credential rotation does not replace worker history; regional migration pre/postflight succeeds.

### DW-2 — Mission/run/step engine

**Depends on:** DW-1. **Deliverable:** state-transition service, queue adapters, leases/heartbeats, cancellation, retries, idempotency and redacted run events.

Acceptance: concurrent workers cannot claim the same lease; retry/resume cannot duplicate a step; replay performs no side effects; dead-lettered runs are visible and recoverable.

### DW-3 — Tool broker, policy and generalized approvals

**Depends on:** DW-2. **Deliverable:** versioned tool registry, authority intersection, policy decisions, proposals, approvals and guarded executor.

Acceptance: policy matrix and content-hash tests pass; organization context cannot be supplied by model output; changed/expired proposals cannot execute; restricted actions are denied.

### DW-4 — Model gateway, entitlement and usage budgets

**Depends on:** DW-2. Can proceed alongside DW-3 after contracts stabilize. **Deliverable:** provider adapter interface, structured outputs, prompt/model versions, AI entitlement decisions, reservations/settlement, timeouts and circuit breakers.

Acceptance: core CRM passes with providers disabled; malformed output is contained; budget exhaustion is deterministic; fallback never crosses region/classification/policy requirements.

### DW-5 — Memory, evaluation and simulation

**Depends on:** DW-3, DW-4. **Deliverable:** provenance-aware memory, fixture runner, rubric/version records, replay/simulation APIs and baseline dashboards.

Acceptance: expired or inaccessible memory is not retrieved; corrections supersede rather than erase history; evaluation runs are reproducible by version; simulation has no side effects.

### DW-6 — Supervisor UI and operator tooling

**Depends on:** DW-3 through DW-5. **Deliverable:** workforce directory, worker detail, missions, runs, approvals, budget/evaluation views, degraded and dead-letter states.

Acceptance: complete keyboard-accessible supervision journey; secrets never render; users can distinguish recommendation, approval and execution; conflict and retry states are understandable.

### DW-7 — Relationship Steward reference rollout

**Depends on:** DW-0 through DW-6 and Relationship Steward RS-0. **Deliverable:** the first registered worker through shadow, recommendation and draft-only cohorts.

Acceptance: end-to-end run is attributable, policy-bound, budgeted, evidence-backed and replayable; agreed evaluation gates pass before each autonomy increase.

### DW-8 — Short-lived run credentials and external tool hardening

**Depends on:** proven internal operation. **Deliverable:** audience-bound, expiring run/tool credentials, external MCP egress allowlists and trust policy.

Acceptance: no external tool receives the platform credential; revocation and expiry are enforced; malicious tool metadata/content is treated as untrusted; region and data-classification policy cannot be bypassed.

## Dependency graph

```text
DW-0 -> DW-1 -> DW-2 -> DW-3 ----> DW-5 -> DW-6 -> DW-7 -> DW-8
                    \-> DW-4 ----/

Relationship Steward:
RS-0 -----------------------------> RS-1 (DW-0..3)
RS-1 -> RS-2 -> RS-3 (DW-4) -> RS-4 -> RS-5 -> RS-6
```

This permits the Steward team to build product contracts and fixtures immediately, but prevents bespoke run, approval, or usage infrastructure from being embedded in the first worker.

## Coding-agent work packet template

Create one Linear child issue and one `codex/<linear-id>-<slug>` branch per milestone. Give the coding agent this packet, replacing bracketed values:

```text
Implement Digital Workers milestone [DW-N] from
docs/architecture/digital-workers-platform-plan.md.

Start by confirming this repository and a clean branch based on the latest
origin/development. Read AGENTS.md, the release policy, the architecture plan,
and the linked Linear issue. Do not implement later milestones or weaken an
existing CRM, campaign, consent, billing, regional, or agent-scope boundary.

Required evidence:
- migration manifest, RLS and cross-tenant tests for data changes
- contract, state transition, concurrency and idempotency tests
- policy/entitlement/budget and dependency-failure tests
- accessibility and secret-redaction tests for UI changes
- code, API/agent, user documentation and CHANGELOG updates

Report changed contracts, commands run, residual risks, rollout/rollback notes,
and update Linear with status and an activity summary. Open a PR to development
only under the repository's required bot identity and review policy.
```

## Release and rollback

- Use organization feature flags; worker definitions begin in draft/paused state.
- Apply additive migrations through protected regional migration automation.
- Activate the platform first with fixture/no-model workers, then Relationship Steward shadow mode.
- Promotion follows feature branch → `development` → exact deployed SHA verification → later `development` to `production` PR.
- Emergency rollback pauses workers, stops new mission dispatch, expires run credentials and proposals, and drains/cancels safe work. It never disables the CRM or removes the audit trail.
