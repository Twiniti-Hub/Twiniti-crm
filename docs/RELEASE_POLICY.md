# Release and promotion policy

Twiniti CRM uses pull requests and a Development-first promotion path for all
application, infrastructure, workflow, and configuration changes.

## Branch rules

- Feature branches target `development` through a pull request.
- Production changes are promoted through a pull request from `development` to
  `production` after Development verification.
- Direct pushes, force pushes, branch deletion, and unreviewed production
  changes are prohibited.
- Emergency fixes use the same production PR path with an explicit incident or
  change reference and a recorded post-incident review.

## Approval identity workflow

- Feature-branch commits and the final reviewable branch push are made by
  `twiniti-code-bot`.
- `George-Twiniti`, as repository CODEOWNER, reviews and approves the final
  bot-pushed commit after required checks have started.
- A review must be submitted with GitHub's **Approve** decision. An approval
  statement submitted as a comment does not satisfy the repository ruleset.
- Any later reviewable push dismisses the effective approval. Required checks
  must run for the new commit and `George-Twiniti` must approve that commit.
- Do not weaken or bypass independent approval, CODEOWNER review, last-push
  separation, required-thread resolution, or mandatory status checks.

## Required evidence

Every PR must identify its Linear issue, user or operational impact, validation
commands, security impact, rollback plan, documentation impact, and changelog
impact. Database changes must also identify migration classification and
compatibility with the currently deployed application.

The required CI checks are policy, migration-chain integrity, typecheck, build,
unit/integration tests, and security scanning. Production promotion additionally
requires the Development deployment receipt, regional health checks, schema
verification, and authenticated E2E evidence.

## Promotion sequence

1. Review and merge the feature PR into `development`.
2. Deploy the exact merged commit to Development.
3. Verify the US, EU, and UK APIs, landing entry points, gateway, worker, health
   endpoints, schema state, and required E2E journeys.
4. Open a promotion PR from `development` to `production` for release-owner
   approval.
5. Deploy the approved production commit and verify all production cells.
6. Record the deployment receipt, rollback commit, and any deferred risk.

The repository workflow validates the source branch, commit identity, and a
successful `E2E / development-smoke` check on the exact Development commit.
GitHub rulesets, protected environments, Render deployment controls, and Neon
access controls are also required; repository documentation cannot replace
those provider settings.
