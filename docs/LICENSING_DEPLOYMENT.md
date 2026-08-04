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
