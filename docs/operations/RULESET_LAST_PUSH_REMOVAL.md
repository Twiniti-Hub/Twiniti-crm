# Remove `require_last_push_approval` (2026-08-14)

George-Twiniti must apply this in GitHub UI. The `twiniti-code-bot` token cannot
update repository rulesets (API returns 404).

## Why

With a two-actor workflow (bot pushes, George approves and merges), last-push
approval blocks every promotion when George merges feature PRs to `development`.

## Steps

For each ruleset below, open **Rules → Edit ruleset → Pull request**:

1. [development-protection](https://github.com/Twiniti-Hub/Twiniti-crm/rules/19619005)
2. [production-protection](https://github.com/Twiniti-Hub/Twiniti-crm/rules/20528589)

Disable:

- **Require approval of the most recent reviewable push** (`require_last_push_approval`)

Keep enabled:

- Require a pull request before merging
- Required approving reviews (1)
- Require review from Code Owners
- Require conversation resolution before merging
- Required status checks (unchanged)

Save each ruleset.

## Workflow after change

1. `twiniti-code-bot` pushes feature/promotion PRs.
2. George-Twiniti **Approve** (CODEOWNER) and **Merge** when checks pass.
3. No bot-tip or last-push handoff PRs required.

## Promotion PR #57 (immediate)

After disabling last-push on **production-protection**:

1. Re-**Approve** PR #57 if stale after PR #58.
2. **Merge** PR #57.
3. Close PR #59 (bot tip) as unnecessary.
