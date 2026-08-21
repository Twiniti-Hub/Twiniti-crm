export const BOT_LOGIN = "twiniti-code-bot";
export const AGENT_BRANCH_PATTERN = /^(cursor|codex)\//;

export function isMutatingGhCommand(command) {
  if (!/\bgh\b/.test(command)) return false;
  if (/\bgh\s+api\s+user\b/.test(command)) return false;
  if (/\bgh\s+auth\s+status\b/.test(command)) return false;
  if (/\bgh\s+pr\s+view\b/.test(command)) return false;
  if (/\bgh\s+pr\s+checks\b/.test(command)) return false;
  if (/\bgh\s+pr\s+diff\b/.test(command)) return false;
  if (/\bgh\s+pr\s+list\b/.test(command)) return false;
  if (/\bgh\s+issue\s+view\b/.test(command)) return false;
  if (/\bgh\s+issue\s+list\b/.test(command)) return false;
  if (/\bgh\s+run\s+view\b/.test(command)) return false;
  if (/\bgh\s+run\s+list\b/.test(command)) return false;
  if (/\bgh\s+api\s+repos\/[^ ]+\/pulls\/\d+\b/.test(command) && !/\s-X\s+(POST|PATCH|PUT|DELETE)\b/i.test(command)) {
    return false;
  }
  return true;
}

export function commandUsesBotToken(command) {
  return /TWINITI_CODE_BOT_GITHUB_TOKEN/.test(command);
}

export function looksLikeCursorAppToken(token) {
  return String(token ?? "").startsWith("ghs_");
}

export function agentPullRequestAuthorFailure({ eventName, headRef, prAuthor }) {
  if (eventName !== "pull_request") return null;
  if (!AGENT_BRANCH_PATTERN.test(headRef || "")) return null;
  if (prAuthor === BOT_LOGIN) return null;
  return (
    `Agent-branch pull request author must be ${BOT_LOGIN} ` +
    `(received ${prAuthor || "unknown"} on ${headRef}). ` +
    "Close this PR and reopen with " +
    'GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh pr create. ' +
    "Do not use Cursor ManagePullRequest or the GitHub App ghs_ identity for PR authorship."
  );
}
