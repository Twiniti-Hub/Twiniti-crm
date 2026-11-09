# Agent instructions (Twiniti CRM)

## WV App Web Visitors (0.10.55.12)

Revision 0.10.55.13 / TWI-1069: preserve typed DNS lookup callbacks and socket
pinning; test the actual transport and generated loader. Redact webhook paths
in request, error and message log serializers. The limiter is bounded per IP
and per API instance. Ingestion and review require transactions and share an
organization advisory lock; reassignment must rebuild every prior owner summary.

TWI-1067 adds organization-admin WV App configuration, token-authenticated
webhook ingestion, deterministic visitor identity resolution, and contact/company
visit histories. Preserve exactly-one-record attribution: resolved people update
the contact; otherwise an independently resolved company may be updated. Never
match a contact from name/title similarity, create a contact without a real email,
or scrape LinkedIn. `customer_events` is authoritative and summary counters are
updated only after a unique event insert. Apply additive migration 0025 before
deploying API/worker/web. See `docs/architecture/WEB_VISITORS.md`.
TWI-1068 adds an admin-only installation side card and public-site validation.
Keep validation SSRF-safe: HTTP(S) only, no URL credentials, public DNS/IPs on
every redirect hop, bounded redirects/time/body, HTML only, and no cookies or
authorization forwarding. The check confirms the organization-specific loader
URL is present in published HTML; it does not execute scripts or emit a visit.

## Production email templates (0.10.55.10)

TWI-1061: `emails/hexclave/production` contains eight native Hexclave TSX templates
and a logo-free companion theme. Match the user-verified fix: omit the Preview
component and literal table logo wrappers; retain PreviewVariables and put Img
directly inside Section. Preserve upstream schemas, token links and
transactional categories. Each template owns its centered public logo. Installation
does not wire CRM/Resend invitations or direct Stripe events into Hexclave. Follow
the directory README for publishing and rollback; preserve cardless-trial wording.

## Background human licensing (0.10.55.8)

TWI-1045/TWI-1051: human requests read per-membership license verification;
only worker jobs call LicenseHub. Preserve explicit denials across retries.
Outage access is at most 24 hours from the last allowance or confirmed Stripe
trial start, capped by entitlement/billing expiry. Never reset this on failure.
Apply additive migration 0024 before deploying the worker and API. See
`docs/LICENSING_DEPLOYMENT.md`; agent entitlement enforcement remains separate.

## Loop Dev configuration receipt (0.10.55.7)

TWI-1044: Dev US service `srv-d9potpr9ik0c73cd5a6g` uses the direct
onrender host for WEB_ORIGIN. This is a service-level override, not a change
to the canonical-host Blueprint. Preserve it during configuration reconciliation.
See `docs/BILLING.md` for the pending Stripe event and Product ID rollout.

## Session recovery safeguards (0.10.55.6)

TWI-1049/1050/1051: reconcile existing Stripe subscriptions before replacement
checkout; fail closed during an unconfirmed or active trial. Keep logout outside
workspace/bootstrap gates. Bound regional discovery and preserve membership checks.
See `docs/BILLING.md` and `docs/operations/EMAIL_VERIFICATION.md`.


## Billing flow

Follow `docs/BILLING.md` (revision 0.10.55.5): one workspace-specific recurring
price, seven cardless trial days for new workspaces, no repeat trial on restart.
Verify actual Stripe prices and portal payment-method updates during deployment.

## Authentication flow

For signup, verification, or checkout changes, follow
`docs/operations/EMAIL_VERIFICATION.md` (revision 0.10.55.4, TWI-1035).
Auth callbacks must remain reachable before workspace and billing gates;
never remove server email verification checks to unblock checkout.

## GitHub identity (non-negotiable)

Cloud Agents launched by George still authenticate Cursor’s built-in GitHub PR
tool as `George-Twiniti`. GitHub will not count a CODEOWNER approval on a PR
the author opened, so that path is forbidden.

- `gh api user --jq .login` must be `twiniti-code-bot` immediately before every GitHub mutation.
- Never operate as `George-Twiniti`.
- Do **not** use Cursor `ManagePullRequest`, GitHub MCP pull-request create, or any GitHub App installation token (`ghs_…`) to open or update pull requests in this repository.
- Create and update PRs only with the bot Runtime Secret:

```bash
GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh api user --jq .login   # must print twiniti-code-bot
GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh pr create --base development --head "$BRANCH" --title "..." --body-file "$BODY" --reviewer George-Twiniti
GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh pr view --json author --jq .author.login   # must print twiniti-code-bot
```

- If a PR author is not `twiniti-code-bot`, close it as the bot and reopen with the commands above. Do not ask George to approve a PR he authored.
- Operator checklist: `docs/operations/CLOUD_AGENT_GITHUB_IDENTITY.md`.
- Shell hook: `.cursor/hooks/assert-github-bot-identity.mjs`.

## Linear hygiene (non-negotiable)

Every agent workstream that touches Twiniti CRM must keep the **CRM** Linear
project current. Do not ship Git/PRs while leaving Linear stale.

### Before coding

1. Find or create a Linear issue on team **Twiniti**, project **CRM**.
2. Put the issue In Progress; use branch `codex/<linear-id>-<slug>`.
3. Link related issues when splitting work (parent/child or related).

### During / at PR open

1. Attach the GitHub PR URL to the Linear issue.
2. Comment the PR URL, tip SHA, and what validation ran.
3. Move the issue to **In Review** when the bot PR is open for George.

### After merge to `development`

1. Comment the merge SHA and any Dev Render deploy / health evidence.
2. Mark Done only when the issue’s outcome is satisfied for Development (or
   keep open if Production promote / operator follow-up remains).

### After Production promote

1. Comment a **Production receipt**: promote PR, Production tip SHA, US/EU/UK
   (+ worker) deploy status, regional `/health`, smoke URL if used, DB
   classification (or “none”), rollback SHA.
2. Close or update related issues; do not leave Done issues without receipts
   when Production was the goal.

### Cadence

- Prefer a CRM **project status update** after a meaningful release cluster
  (roughly weekly when active), not only at launch gates.
- If you discover shipped PRs without Linear ids, create a retro Done issue
  linking those PRs rather than leaving the gap.

### Do not

- Close issues without stating disposition and evidence.
- Leave In Progress issues idle across sessions without a status comment.
- Treat GitHub as the only system of record for Twiniti CRM work.
