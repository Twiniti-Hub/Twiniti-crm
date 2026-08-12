# Branch reconciliation record: TWI-187

Date: 2026-08-12

## Scope

Reconcile the legacy `production` ancestry into `development` before the first
policy-compliant Development-to-Production promotion. This operation does not
rewrite either protected branch and does not introduce new application
behavior.

## Cause

The branches diverged at `07d9afc`. Three billing-gateway commits were written
to Production on 2026-08-06 before the Production protection ruleset was
enabled. Equivalent application changes were also committed independently to
Development, so GitHub reported Production as three commits ahead even though
the functionality was already present in Development.

Subsequent policy, migration-control, analytics, E2E, and Loop-branding changes
were merged into Development, but no promotion pull request was opened. The
result was a two-way historical fork: Production was three commits ahead by
ancestry and twelve commits behind Development.

## Reconciliation

- Start from the exact current `origin/development` commit.
- Merge `origin/production` into a protected reconciliation branch so the
  legacy Production commits become part of Development history.
- Keep the canonical Development changelog entries and record this operation as
  version `0.10.20`.
- Preserve Development values in `render.yaml`; Production service definitions
  and environment boundaries remain in `render.production.yaml`.
- Do not copy secrets, connection strings, deployment identifiers, or live
  provider configuration into the repository.

The merge is ancestry reconciliation. Equivalent billing code is not applied a
second time.

## Verification gates

Before merging the reconciliation pull request into Development:

1. `pnpm policy:check`
2. `pnpm policy:db-chain:strict`
3. `pnpm check`
4. `pnpm test`
5. `pnpm build`
6. Required GitHub policy, CI, and security checks
7. Independent CODEOWNER and last-push approval

After the merge, the exact Development commit must pass
`E2E / development-smoke` before it can be proposed to Production. The
Production promotion pull request must originate from `development` and pass
the repository's `production / development-source` check.

The first exact-commit run exposed two existing test-harness assumptions: the
authenticated fixture did not wait for Hexclave sign-in completion, and Stripe
Checkout began collapsing its card fields behind a payment-method button. The
`0.10.21` test-only hardening makes those states explicit; it must pass on the
new exact Development commit before promotion continues.

The follow-up run confirmed that the persistent account was authenticated but
required onboarding, and that hosted Checkout keeps its selected-card button
hidden while rendering card fields in the top-level checkout page alongside
duplicate express-payment iframes. Version `0.10.22` records those hosted-state
corrections. The generated signup test must still complete billing and contact
creation before Production promotion.

## Deployment and rollback boundary

The reconciliation pull request changes repository history and documentation;
it does not itself authorize a Production deployment. The subsequent promotion
must verify the Development deployment receipt, regional schema state, and US,
EU, and UK application health before Production approval.

If reconciliation validation fails, close the reconciliation pull request and
leave both protected branches unchanged. If Production verification fails after
promotion, use the previously deployed Production commit `6371bad` as the
application rollback boundary and follow the regional rollback procedure in
`docs/HARDENING.md`. Never force-reset or directly push either protected branch.
