# Branch reconciliation record: TWI-1107

Date: 2026-11-16

## Scope

Record Production tip `3b56fb2` in Development ancestry before promoting the
Development changes for TWI-1095 and TWI-1097. The reconciliation starts from
Development tip `04f6c0c` and does not rewrite either protected branch.

## Cause

Production promotion pull requests were merged with merge commits that were not
subsequently merged back into Development. GitHub therefore reported a two-way
historical fork even though the Production-only side consisted of prior
promotion merges. Development also contained six newer commits for the Loop
landing redesign and bounded Development-origin wake behavior.

## Reconciliation

- Start from exact Development commit `04f6c0c`.
- Merge exact Production commit `3b56fb2` into a protected reconciliation branch.
- Preserve Development's application content and environment-specific files.
- Deliver the ancestry merge through a bot-authored pull request to Development.
- Do not force-push, reset, or directly update either protected branch.

The merge is history-only: it introduces no application, dependency, database,
configuration, or package-version change. After the merge, Production has no
commit missing from the reconciliation branch; Development remains ahead with
its six feature/merge commits plus the reconciliation commit.

## Validation and promotion

Before merging the reconciliation pull request:

1. Run release-policy and migration-chain checks.
2. Run the repository typecheck and tests appropriate to the unchanged content.
3. Confirm `origin/production` is an ancestor of the reconciliation tip.

After the pull request merges, the exact new Development tip must pass the
hosted `E2E / development-smoke` check. Production promotion must then use the
canonical `development` branch as its source and follow `docs/RELEASE_POLICY.md`.
Record Development and Production deployment receipts, regional health, schema
classification, and rollback SHA on the linked Linear issues.

## Rollback

Before the reconciliation PR merges, close it and delete only its task branch.
After merge, do not rewrite Development. If the ancestry merge causes an
unexpected issue, revert it through a new bot-owned pull request and record the
disposition on TWI-1107.
