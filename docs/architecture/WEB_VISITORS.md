# WV App Web Visitors architecture

Revision: 0.10.55.11
Linear: TWI-1067

## Scope

WV App Web Visitors is configured per Loop organization. An administrator saves the public website-loader key, enables ingestion, and receives a webhook token once. Loop stores only the SHA-256 token hash. The browser loader continues to use the supplier-required runtime global, but all Loop product, database, API, worker, and audit naming uses `web_visitors` / **WV App Web Visitors**.

## Data flow

1. `POST /api/v1/webhooks/web-visitors/:token` hashes the bearer path token and resolves one enabled integration. The boundary adapter maps WV App's fixed title-cased webhook fields into the internal camelCase contract; supplier spellings do not leak into CRM processing.
2. The API validates the bounded normalized payload, stores one deduplicated `webhook_events` receipt, enqueues `webhook.web_visitors.process`, and returns `202`.
3. The regional worker reads the receipt under service RLS and runs the deterministic resolver.
4. The resolver checks, in order, an existing confirmed mapping, exact normalized business email, then exact active normalized professional-profile identity. Company resolution uses an existing mapping or exact normalized domain.
5. Conflicting exact contact evidence becomes `ambiguous`. Similar names, titles, locations, and employer names never attach a contact.
6. The worker inserts an immutable `customer_events` row with `event_type = web_visitor.visit`. A successful unique insert atomically increments the summary fields on exactly one record: contact when resolved, otherwise independently resolved company.

`customer_events` is the source of truth. `web_visitor_visit_count`, `web_visitor_first_visited_at`, and `web_visitor_last_visited_at` are materialized summaries and may be rebuilt from events.

## Professional-profile boundary

Only HTTPS `linkedin.com/in/{slug}` identifiers supplied by WV App or already authorized in Loop are accepted. Normalization removes locale prefixes, query parameters, fragments, duplicate separators, and case differences. Deceptive hosts and non-person paths are rejected. Loop does not fetch LinkedIn pages, automate a LinkedIn session, retain LinkedIn cookies, or call undocumented LinkedIn endpoints.

## Idempotency and attribution

The API dedupe key combines integration and normalized visit payload identity. The jobs table prevents duplicate worker dispatch, and `customer_events(organization_id, dedupe_key)` prevents duplicate CRM activity. The counter update occurs only when the event insert returns a new row. Worker execution is already enclosed by the service-RLS transaction, so event and summary changes commit together.

A visit never increments both contact and company. Contact-company reporting may derive company-level engagement through the association without duplicating the underlying event.

## Schema and rollout

Migration `0025_web_visitors.sql` is additive and backward compatible with the previously deployed application. It adds:

- `web_visitor_integrations`
- `web_visitor_identity_mappings`
- contact/company visit summary columns
- webhook receipt deduplication
- organization RLS policies for the new tables

Apply the migration to Development US, EU, and UK before deploying the worker, API, and web application. Rollback is a forward fix: disable integrations and deploy the prior runtime; retain event and mapping evidence until a separately approved destructive migration is prepared.

## Security and privacy

- Configuration and resolution review require organization admin access.
- Public webhook failures do not reveal whether an organization or token exists.
- Tokens and personal payloads must not be logged.
- Payload size and fields are bounded by strict contracts.
- Identity decisions retain method, evidence, confidence band, resolver version, and review actor.
- Agent credentials do not receive WV App configuration or ambiguity-review access in this revision.
