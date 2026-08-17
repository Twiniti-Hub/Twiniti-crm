# Release and promotion policy

| Field | Repository value |
| --- | --- |
| Policy version | `0.1.0.0` |
| Repository | `Twiniti-Hub/Twiniti-crm` |
| Development branch | `development` |
| Production branch | `production` |
| Pull requests | `required` |
| GitHub automation identity | `twiniti-code-bot` |
| Independent human approver | `George-Twiniti` |

Twiniti CRM uses pull requests and a Development-first promotion path for all application, infrastructure, workflow, configuration, database, documentation, and release changes.

## Mandatory starting checks

Before changing files, committing, pushing, or performing any GitHub mutation, the agent must confirm the canonical `C:\Users\George\Source\Twiniti-CRM` checkout, `Twiniti-Hub/Twiniti-crm` origin, current branch, complete worktree status, unrelated user-owned changes, target branch, Linear issue, version and changelog impact, and the live repository rulesets.

`gh api user --jq .login` must return `twiniti-code-bot` immediately before every agent-owned GitHub mutation. Credential-list status alone is not proof. The agent must never operate as `George-Twiniti`; George performs the independent CODEOWNER approval himself.

### Cloud Agent GitHub identity

Cursor Cloud Agents can have two GitHub credentials: a GitHub App installation token used for clone/push, and whatever `gh` reads from `GH_TOKEN`. App tokens must not be used for PR authorship. Configure Cloud Agents Runtime Secret **`TWINITI_CODE_BOT_GITHUB_TOKEN`** (a PAT owned by `twiniti-code-bot`) and run mutating `gh` commands as `GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh …`. A project `beforeShellExecution` hook enforces the bot identity check before mutating `gh` commands. Full operator steps: `docs/operations/CLOUD_AGENT_GITHUB_IDENTITY.md`.

Use the canonical repository folder and branches only. Do not create a Git worktree or additional checkout unless George explicitly requests one. Preserve unrelated local files and stage only scoped paths.

## Branch rules

- Task branches are created from current `origin/development` and target `development` through a pull request.
- Agent task branches use `codex/<linear-id>-<short-slug>`.
- Production changes are promoted through a pull request from the canonical `development` branch to `production` after exact-commit Development verification.
- Work must not begin on Production, and a Development change must not be recreated manually on Production.
- Direct pushes, force pushes, branch deletion, and unreviewed Production changes are prohibited.
- Emergency fixes use the same Development-first and Production PR path unless a named incident commander explicitly records an exception, exact commit, validation, rollback, and immediate Development reconciliation.

## Approval identity workflow

- Feature-branch commits and the final reviewable branch push are made by `twiniti-code-bot`.
- `George-Twiniti`, as repository CODEOWNER, reviews and personally approves the exact final bot-pushed commit after required checks have started.
- A review must be submitted with GitHub's **Approve** decision. An approval statement submitted as a comment does not satisfy the repository ruleset.
- Any later reviewable push dismisses the effective approval. Required checks must run for the new commit and George must approve that commit.
- Do not weaken or bypass independent approval, CODEOWNER review, last-push separation, required-thread resolution, or mandatory status checks.
- Merge only under the repository's stated merge authority after the current head is approved and all required checks pass.

## Required evidence

Every PR must identify its Linear issue, user or operational impact, validation commands and results, security impact, rollback plan, code/agent/user documentation impact, changelog and version impact, and deferred risks. Database changes must also identify migration classification and compatibility with the currently deployed application.

The required CI checks are policy, migration-chain integrity, typecheck, build, unit/integration tests, and security scanning. Production promotion additionally requires the exact Development deployment receipt, regional health checks, schema verification, and authenticated E2E evidence.

## Promotion sequence

1. Review and merge the bot-owned feature PR into `development`.
2. Deploy the exact merged commit to Development.
3. Verify the US, EU, and UK APIs, landing entry points, gateway, worker, health endpoints, schema state, and required authenticated E2E journeys.
4. Open a promotion PR from the canonical `development` branch to `production` for release-owner approval.
5. Verify that the proposed SHA is contained in `development` and has a successful `E2E / development-smoke` check on that exact commit.
6. After approval and all required checks, merge and deploy the approved Production commit, then verify all Production cells.
7. Record the Development and Production deployment receipts, rollback commit, and any deferred risk in Linear.

GitHub rulesets, protected environments, Render deployment controls, and Neon access controls are required; repository documentation cannot replace provider enforcement.

## Completion requirements

A major or minor update is not complete until applicable code, agent, and user documentation and `CHANGELOG.md` are updated. Determine the current version from repository release metadata; do not assume a major version. Use the repository's confirmed versioning convention when a version change is required. Policy-only reconciliation does not change the application version unless a release is explicitly approved.
