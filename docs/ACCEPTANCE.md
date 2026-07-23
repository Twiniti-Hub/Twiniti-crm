# Acceptance criteria (agent-ready)

Release acceptance for the Agent-Native Marketing CRM. An agent (or human) can treat each item as a falsifiable check.

## Test layers

- [ ] Unit: property validation and filter AST compilation
- [ ] Integration: API against Neon preview branches
- [ ] Auth: Hexclave session + bootstrap/`AUTH_DISABLED` modes; role gates
- [ ] Email: Resend adapter contract tests
- [ ] Webhooks: signature validation + duplicate event idempotency
- [ ] Rendering: email HTML/text personalization across clients (spot-check)
- [ ] Migration: HubSpot-like export fixtures import cleanly
- [ ] E2E: Playwright smoke for shell routes + create contact
- [ ] Load: 100,000 contacts / large segments
- [ ] Failure: provider rate limits, worker crashes, retries, partial imports

## Release gates

- [ ] HubSpot property definitions import without losing internal names or options
- [ ] Custom fields usable in forms, segments, workflows, and personalization
- [ ] Campaign send never targets suppressed or unsubscribed contacts
- [ ] Duplicate Resend webhooks do not create duplicate engagement records
- [ ] Interrupted imports resume safely
- [ ] Campaign retries cannot duplicate a recipient send (idempotency key)
- [ ] Every sensitive administrative action appears in the audit log
- [ ] Contact and segment queries meet p95 ≤ 2s at 100k contacts
- [ ] Production deploy, backup, restore, and rollback procedures are documented ([`HARDENING.md`](./HARDENING.md))

## Agent / MCP harness

Use [`apps/api/src/tests/agent-harness.test.ts`](../apps/api/src/tests/agent-harness.test.ts) as the case catalog:

- [ ] Agent can search and get contacts with `contacts:read`
- [ ] Agent can create/upsert contacts within scope; duplicate email returns conflict guidance
- [ ] Agent can draft + preview campaigns; cannot send without approval
- [ ] Agent request-approval succeeds; send without approved approval fails
- [ ] Revoked agent credentials are rejected
- [ ] Dry-run headers do not persist mutations
- [ ] MCP tool list matches scoped REST capabilities

## Product slices (SPA)

- [ ] Overview shows live `/api/v1/reports/overview` + `/api/v1/me`
- [ ] Contacts list/create with duplicate conflict messaging
- [ ] Companies, segments (filter AST), campaigns (preview → approval → send), forms, workflows, agents (token once + revoke), deliverability, settings

## Assumptions locked from plan

- Single organization v1 with `organization_id` boundary for future multi-tenancy
- HubSpot migration is one-time import only (no bi-directional sync)
- Marketing Hub core is the v1 product boundary
- Resend is the only email delivery provider in v1
- CRM consent/suppression state is authoritative over provider state
