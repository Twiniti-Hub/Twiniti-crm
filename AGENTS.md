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
