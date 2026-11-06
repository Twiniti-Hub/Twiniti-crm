# CRM License_API deployment

This document configures the Twiniti CRM API and worker to communicate with License_API. The browser never receives the License_API credential.

## Configuration boundary

The CRM API and worker both require the same server-to-server values:

```text
LICENSE_API_URL=https://license-api-q2sg.onrender.com
LICENSE_API_API_KEY=<dedicated Twiniti CRM application key>
LICENSE_API_PRODUCT_CODE=twiniti-loop
LICENSE_API_PLAN_CODE=standard
LICENSE_API_GRACE_PERIOD_DAYS=7
LICENSE_API_REQUEST_TIMEOUT_MS=5000
LICENSE_API_CACHE_TTL_MS=15000
LICENSE_API_REQUIRED=true
```

`LICENSE_API_API_KEY` must be added as a secret in both the `twiniti-crm-api` and `twiniti-crm-worker` Render services. Do not put it in `VITE_*` variables, commit it, or reuse the Praxis key.

On License_API, set the same key as `TWINITI_CRM_API_KEY`. The License_API public and admin authentication helpers recognize this variable as the `Twiniti CRM` application identity. The key value must match the CRM secret, but the CRM key must remain distinct from `PRAXIS_API_KEY`.

## SuperAdmin status refresh

The SuperAdmin organization dashboard queues a background check for an active
administrator (or active member). It reads the last stored organization summary;
it does not wait for LicenseHub. The worker updates that summary after verification.

## Background human verification (revision 0.10.55.8)

Authenticated human requests validate the selected active CRM membership, read
its `license_verification` snapshot, and enqueue `license.verify` when the last
attempt is at least five minutes old. Jobs deduplicate per organization, member,
and five-minute interval. LicenseHub latency is absent from the human request
path. Agent checks and their `TCRM_AGENT_ACCESS` requirement are unchanged.

The snapshot keeps the last definitive decision separately from the latest
attempt and failure reason/request ID. A retry or missing-user result cannot
erase an earlier denial or extend a previous allowance. Explicit `deny`,
`restricted`, revoked/suspended/expired status, and known expiry remain enforced.

With locally active Stripe billing, a previously allowed member may continue
for at most 24 hours from their last confirmed check. A new member without a
decision can continue during a server-confirmed Stripe trial for at most 24
hours from its recorded start. Both deadlines are capped by the billing period
or trial end and any known license expiry. Pending/unconfirmed billing grants
no temporary access. Active paid users without a per-member snapshot wait for
their first worker check; organization-level snapshots are not copied to users.
New revocations are detected on the next successful background check; an outage
can delay detection until the fixed grace deadline.

The worker provisions the active principal before subscription synchronization,
independently of the original provision job's terminal status. Provisioning uses
stable organization/user idempotency keys and records returned flat or nested
LicenseHub organization/user/license IDs. Verification repairs missing-user
responses and retries the check without a stale adapter cache. Initial recovery
also synchronizes the current stored Stripe state. Definitive denials do not
trigger a new trial or reset billing. Failed jobs retain normal queue retries;
later page activity schedules another bounded verification job if needed.

No new environment variables are needed. The existing regional worker must be
running with access to the same regional queues and LicenseHub credentials.
Read-only Dev logs on 5 November 2026 showed service
`srv-d9iham4vikkc73998e2g` with `polling=disabled` for US/EU/UK. This blocks
all queued license work. Before live verification, obtain approval to enable
`JOBS_POLL_ENABLED=true` and set `WORKER_POLL_INTERVAL_MS=2000` on that worker;
the Dev default interval is otherwise two hours. Review queued non-license
work first because enabling this loop also processes other job kinds. No live
configuration changes were made as part of this implementation.
`LICENSE_API_GRACE_PERIOD_DAYS` remains the subscription payment-grace setting;
it does not control the fixed 24-hour outage allowance.

### Rollout and verification

Migration `0024_user_license_verification` adds one nullable JSONB column to
`crm_users`, protected by its existing RLS. Classification: additive, no backfill.
Apply the canonical regional migration chain before deploying the updated worker
and API. Old code can coexist with the added column; new code requires it.
Do not run live migrations as part of local tests. Follow the regional release
policy and record receipts for each target. Rollback application/worker commits
while retaining the nullable column; no destructive rollback is needed.

On Development, test Personal and Organization signup through checkout, worker
provision/sync/verify, stored returned IDs, and access to `/me` and `/overview`.
Exercise an unavailable LicenseHub, expired grace, and explicit denial. Confirm
warnings clear after recovery. Inspect failed regional jobs and their `lastError`
and snapshot failure request IDs; do not include API keys in receipts.

## Render setup

`render.yaml` declares the required CRM API and worker variables. Because the values are secrets or deployment-specific, Render will require the `sync: false` values to be supplied in the service environment:

1. Add `LICENSE_API_URL` to both services.
2. Add the same dedicated CRM key as `LICENSE_API_API_KEY` to both services.
3. Set `LICENSE_API_REQUIRED=true` for production.
4. Redeploy the API and worker after saving the variables.
5. Confirm the API startup succeeds. Production configuration rejects startup when the URL or key is missing.

## Endpoint contract

The CRM adapter sends `x-api-key`, `x-client-app: twiniti-crm`, `x-request-id`, and `idempotency-key` headers to these server-to-server POST routes:

```text
/api/v1/integrations/twiniti-crm/provision
/api/v1/integrations/twiniti-crm/subscription
/api/v1/integrations/twiniti-crm/license/check
/api/v1/integrations/twiniti-crm/agent/provision
/api/v1/integrations/twiniti-crm/agent/revoke
```

These routes must exist on the configured License_API base URL. The public legacy `/api/v1/verify` route used by Praxis is not an equivalent substitute: it is email-based and does not implement CRM organization provisioning, Stripe synchronization, or organization-bound license checks.

## Verification checklist

- [ ] CRM API Render service has all `LICENSE_API_*` values.
- [ ] CRM worker Render service has all `LICENSE_API_*` values.
- [ ] License_API has a dedicated CRM application key with the required integration scopes.
- [ ] The CRM key is different from Praxis's key.
- [ ] `POST /api/v1/integrations/twiniti-crm/provision` returns a valid envelope for an authorized test request.
- [ ] `POST /api/v1/integrations/twiniti-crm/subscription` accepts an idempotent test event.
- [ ] `POST /api/v1/integrations/twiniti-crm/license/check` returns `allow`, `restricted`, `deny`, or `retry` with a stable reason code.
- [ ] Agent licenses include the enabled `TCRM_AGENT_ACCESS` entitlement.
- [ ] Agent creation queues `/agent/provision`; agent revocation queues `/agent/revoke`.
- [ ] Agent license checks require both the entitlement and an active agent assignment.
- [ ] A CRM production login succeeds with `LICENSE_API_REQUIRED=true`.
- [ ] A temporary License_API outage produces bounded retry behavior and does not grant indefinite offline access.

Never record API key values in logs, screenshots, tickets, or committed documentation.
