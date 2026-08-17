# Cloud Agent GitHub identity

Twiniti release policy requires agent-owned GitHub mutations (especially PR create) to be authored by **`twiniti-code-bot`**, never `George-Twiniti`. CODEOWNER approval is independent: George approves bot-authored PRs.

## Why this exists

Cursor Cloud Agents typically have two credentials:

| Path | Typical credential | Effect |
| --- | --- | --- |
| `git` clone / push | Cursor GitHub App installation token (`ghs_…`) | Can push commits |
| `gh` (PR create, API writes) | `GH_TOKEN` / `gh auth` | Sets **PR author** |

If `GH_TOKEN` is the App token or George’s session, `gh pr create` attributes the PR to the wrong user and breaks CODEOWNER self-approval.

Prefer a **dedicated secret name**. Cursor may overwrite plain `GH_TOKEN` with an App `ghs_…` token.

## Operator checklist (George)

1. Create a fine-grained PAT **owned by `twiniti-code-bot`** (or classic PAT with `repo` + PR access) with at least:
   - Contents: Read and Write (if used for push)
   - Pull requests: Read and Write
   - Metadata: Read
2. In [Cloud Agents dashboard](https://cursor.com/dashboard?tab=cloud-agents) for the Twiniti / Twiniti-CRM environment, add a **Runtime Secret**:
   - Name: **`TWINITI_CODE_BOT_GITHUB_TOKEN`**
   - Value: the bot PAT
3. Confirm the secret is available to Cloud Agents for this repo/environment.
4. Do **not** commit the token.

## Verify

```bash
GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh api user --jq .login
# → twiniti-code-bot
```

Local agents already authenticated as the bot can use their normal `gh` session; Cloud Agents should prefix mutations:

```bash
GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh pr create ...
```

## Repo enforcement

- Hook: `.cursor/hooks.json` → `.cursor/hooks/assert-github-bot-identity.mjs` on `beforeShellExecution`
- Behavior: mutating `gh` commands are denied unless identity resolves to `twiniti-code-bot`. When `TWINITI_CODE_BOT_GITHUB_TOKEN` is set and Cursor has injected `ghs_…` as `GH_TOKEN`, the hook denies until the command references the bot secret.

## If a PR was opened as George-Twiniti

1. As `twiniti-code-bot`, close the mis-authored PR with a short note.
2. Open a new PR from the same branch → `development` so **author = twiniti-code-bot**.
3. Confirm required checks on the tip SHA.
4. Comment the new PR URL on the Linear issue.
5. George CODEOWNER **Approve** (and merge when ready).

## Out of scope

- Do not weaken CODEOWNERS or `require_code_owner_review`.
- Replacing Cursor’s App token for all `git` operations is not required; PR authorship via `gh` is the critical path.
