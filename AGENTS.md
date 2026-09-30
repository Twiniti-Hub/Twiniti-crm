# Agent instructions (Twiniti CRM)

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
