# Phase 7 — Enterprise hardening checklist

Production-ready cutover for Twiniti CRM. Work through each section before go-live sign-off.

## 1. Load testing

- [ ] Seed ~100,000 contacts and large segments in a non-prod Neon branch
- [ ] Measure contact search and segment estimate p95 (target ≤ 2s)
- [ ] Exercise list/report overview endpoints under concurrent load
- [ ] Confirm worker queue depth stays bounded during campaign enqueue storms
- [ ] Capture baseline CPU/memory/DB IO for API + worker

## 2. Disaster recovery (DR)

- [x] Document Neon backup / point-in-time restore procedure
- [ ] Rehearse restore into a preview branch and validate schema + sample queries
- [x] Document Render rollback (previous deploy) for API, web, and worker
- [x] Verify secrets remain `sync: false` and recoverable from vault
- [ ] Record RPO/RTO targets and owners

### Neon backup / PITR (procedure)

1. Open the Neon console for the Twiniti CRM project → **Branches** / **Backup & restore**.
2. Note the current production branch and earliest available PITR timestamp.
3. To restore: create a new branch from a point in time (or snapshot), then update `DATABASE_URL` on Render (API + worker) to the restored connection string for validation.
4. Run `pnpm db:migrate` only if the restored schema is behind; otherwise verify with `/health` and a contact search.
5. After validation, either promote the restored branch or copy data forward; keep the prior connection string recorded for rollback.

### Render rollback (procedure)

1. Open [Render Dashboard](https://dashboard.render.com) → service `Twiniti-crm` (and worker if separate).
2. **Events** / deploys → select the last known-good deploy → **Rollback** (or clear-cache redeploy of that commit).
3. Confirm `/health` returns `authMode: hexclave` (or expected mode) and that `VITE_*` build env vars are still present (Vite vars require a rebuild if missing).
4. Worker: redeploy the matching commit so job processors stay schema-compatible with the API.

Secrets for this project are `sync: false` in [`render.yaml`](../render.yaml); recover from the team vault / Render env UI — never from git.

## 3. Security

- [x] Review Hexclave auth paths (same-origin SignIn + cookie token store, role gates)
- [ ] Agent abuse cases: over-scoped tokens, revoked credentials, dry-run vs mutate
- [ ] Prompt-injection / tool-jailbreak attempts against MCP agent tools
- [x] Webhook signature validation for Resend (reject invalid signatures)
- [ ] Penetration pass on public form submit + `/mcp` surfaces
- [ ] Confirm no secrets in repo, CI logs, or OpenAPI examples

## 4. Accessibility (a11y)

- [ ] Keyboard navigation across shell nav and primary forms
- [ ] Focus visibility on inputs/buttons; skip-link or landmark structure
- [ ] Color contrast on teal/green brand surfaces
- [ ] Screen reader labels for tables, banners, and destructive actions (revoke/send)
- [ ] Reduce-motion / no essential info only in color

## 5. Retention & deletion

- [ ] Contact/company soft-delete or hard-delete workflow documented
- [ ] Suppression and consent retention rules documented
- [ ] Audit log retention window + export path
- [ ] Email event retention vs deliverability reporting needs
- [ ] Right-to-erasure rehearsal (PII scrub + audit of scrub)

## 6. Cutover

- [ ] HubSpot one-time export rehearsal on production-sized fixture
- [ ] Cutover playbook: freeze window, import, verify counts, enable sending
- [ ] Disable HubSpot marketing sends after cutover (no bi-directional sync)
- [ ] Monitoring: health, worker failures, bounce/complaint spikes, auth errors
- [ ] Go/no-go checklist signed by owner + engineering

## Exit criteria

- Acceptance checklist in [`ACCEPTANCE.md`](./ACCEPTANCE.md) is fully met
- Cutover playbook rehearsed and signed off
- Load, DR, security, a11y, and retention items above are complete or explicitly deferred with owners
