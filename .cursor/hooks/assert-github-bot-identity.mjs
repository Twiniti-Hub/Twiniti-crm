#!/usr/bin/env node
/**
 * beforeShellExecution: Twiniti CRM release policy requires GitHub mutations
 * to run as twiniti-code-bot. Cloud Agents often inject a Cursor GitHub App
 * token (ghs_...) as GH_TOKEN; prefer TWINITI_CODE_BOT_GITHUB_TOKEN instead.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BOT_LOGIN,
  commandUsesBotToken,
  isMutatingGhCommand,
  looksLikeCursorAppToken
} from "../../scripts/policy/github-bot-identity.mjs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function probeLogin(env) {
  const result = spawnSync("gh", ["api", "user", "--jq", ".login"], {
    encoding: "utf8",
    env,
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) return null;
  return String(result.stdout ?? "").trim() || null;
}

function runHook() {
  const raw = readStdin();
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    respond({ permission: "allow" });
    return;
  }

  const command = String(input.command ?? "");
  if (!isMutatingGhCommand(command)) {
    respond({ permission: "allow" });
    return;
  }

  const botToken = process.env.TWINITI_CODE_BOT_GITHUB_TOKEN?.trim() || "";
  const probeEnv = { ...process.env };
  if (botToken) {
    probeEnv.GH_TOKEN = botToken;
    probeEnv.GITHUB_TOKEN = botToken;
  }

  const login = probeLogin(probeEnv);
  const currentGhToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";

  if (login !== BOT_LOGIN) {
    respond({
      permission: "deny",
      user_message: "GitHub mutation blocked: identity is not twiniti-code-bot.",
      agent_message:
        "Twiniti RELEASE_POLICY requires GitHub mutations as twiniti-code-bot. " +
        (botToken
          ? "TWINITI_CODE_BOT_GITHUB_TOKEN is set but gh api user did not return twiniti-code-bot. Fix the PAT ownership/scopes."
          : "Set Cloud Agents Runtime Secret TWINITI_CODE_BOT_GITHUB_TOKEN to a PAT owned by twiniti-code-bot, then re-run as: " +
            'GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" <your gh command>. ' +
            "Never open PRs as George-Twiniti. Never use Cursor ManagePullRequest for this repository.")
    });
    return;
  }

  if (botToken && looksLikeCursorAppToken(currentGhToken) && !commandUsesBotToken(command)) {
    respond({
      permission: "deny",
      user_message: "Prefix GH_TOKEN with the bot Runtime Secret before mutating GitHub.",
      agent_message:
        "Cursor injected a GitHub App installation token (ghs_...) as GH_TOKEN. " +
        "Re-run the mutation with the bot secret so the PR/author is twiniti-code-bot:\n" +
        `GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" ${command}`
    });
    return;
  }

  respond({ permission: "allow" });
}

runHook();
