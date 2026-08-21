import assert from "node:assert/strict";
import test from "node:test";
import {
  agentPullRequestAuthorFailure,
  commandUsesBotToken,
  isMutatingGhCommand,
  looksLikeCursorAppToken
} from "./github-bot-identity.mjs";

test("treats PR create/update/close as mutating gh", () => {
  assert.equal(isMutatingGhCommand("gh pr create --base development"), true);
  assert.equal(isMutatingGhCommand('GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh pr create'), true);
  assert.equal(isMutatingGhCommand("gh pr close 69 --comment note"), true);
  assert.equal(isMutatingGhCommand("gh pr edit 70 --add-reviewer George-Twiniti"), true);
  assert.equal(isMutatingGhCommand("gh api repos/Twiniti-Hub/Twiniti-crm/pulls -X POST"), true);
});

test("allows identity probes and read-only gh", () => {
  assert.equal(isMutatingGhCommand("gh api user --jq .login"), false);
  assert.equal(isMutatingGhCommand("gh pr view 70 --json author"), false);
  assert.equal(isMutatingGhCommand("gh pr checks 70"), false);
  assert.equal(isMutatingGhCommand("pnpm test"), false);
});

test("detects bot secret usage and Cursor App tokens", () => {
  assert.equal(commandUsesBotToken('GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh pr create'), true);
  assert.equal(commandUsesBotToken("gh pr create"), false);
  assert.equal(looksLikeCursorAppToken("ghs_example"), true);
  assert.equal(looksLikeCursorAppToken("gho_example"), false);
});

test("fails cursor/codex PRs unless authored by twiniti-code-bot", () => {
  assert.equal(
    agentPullRequestAuthorFailure({
      eventName: "pull_request",
      headRef: "cursor/landing-robots-sitemap-77d2",
      prAuthor: "George-Twiniti"
    })?.includes("twiniti-code-bot"),
    true
  );
  assert.equal(
    agentPullRequestAuthorFailure({
      eventName: "pull_request",
      headRef: "codex/twi-354-bot-identity",
      prAuthor: "twiniti-code-bot"
    }),
    null
  );
  assert.equal(
    agentPullRequestAuthorFailure({
      eventName: "pull_request",
      headRef: "georgebroadbent/twi-354-manual",
      prAuthor: "George-Twiniti"
    }),
    null
  );
  assert.equal(
    agentPullRequestAuthorFailure({
      eventName: "push",
      headRef: "cursor/foo",
      prAuthor: "George-Twiniti"
    }),
    null
  );
});
