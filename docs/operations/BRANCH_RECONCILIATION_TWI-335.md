# Branch reconciliation record: TWI-335

Date: 2026-08-13

## Scope

Record Production tip `76b9209` (merge of PR #34) in `development` ancestry so
promotion PR #47 satisfies the Production ruleset
`strict_required_status_checks_policy`.

## Cause

`development` continued linearly after the content of PR #34 without containing
the Production merge commit itself. GitHub therefore treated the promotion PR
(`development` → `production`) as out-of-date even though Development already
had the released application history plus later Kanban/AuthGate work.

## Reconciliation

- Merge `origin/production` into `development` through bot-owned PR #48.
- No application behavior change; additive documentation only in this commit.
- After merge, re-verify `E2E / development-smoke` on the new Development tip
  before merging promotion PR #47.

## Notes

- `E2E / development-signup` Stripe Checkout flakes are not a required
  Production status check.
- Production still requires additive migration `0014` (US → EU → UK) before or
  at deploy of `0.10.46`.
