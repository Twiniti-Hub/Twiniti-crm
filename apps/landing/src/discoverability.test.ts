import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const landingRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = path.join(landingRoot, "public");
const robotsPath = path.join(publicDir, "robots.txt");
const sitemapPath = path.join(publicDir, "sitemap.xml");
const productionOrigin = "https://loop.twiniti.ai";

const requiredAiUserAgents = [
  "GPTBot",
  "OAI-SearchBot",
  "Claude-Web",
  "Google-Extended",
  "Amazonbot",
  "anthropic-ai",
  "Bytespider",
  "CCBot",
  "Applebot-Extended"
] as const;

function parseRobotGroups(source: string): Array<{ userAgents: string[]; rules: string[] }> {
  const groups: Array<{ userAgents: string[]; rules: string[] }> = [];
  let current: { userAgents: string[]; rules: string[] } | null = null;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) {
      continue;
    }

    const separator = line.indexOf(":");
    assert.notEqual(separator, -1, `robots.txt line is not a field: ${rawLine}`);
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
      }
      current.userAgents.push(value);
      continue;
    }

    if (field === "allow" || field === "disallow") {
      assert.ok(current, "Allow/Disallow must follow a User-agent group");
      current.rules.push(`${field}:${value}`);
      continue;
    }

    if (field === "sitemap") {
      continue;
    }

    assert.fail(`unsupported robots.txt field: ${field}`);
  }

  return groups;
}

test("robots.txt allows search and named AI crawlers and points at the sitemap", () => {
  const robots = fs.readFileSync(robotsPath, "utf8");
  assert.match(robots, /^User-agent:/m);
  assert.match(robots, /^Allow:/m);
  assert.match(robots, new RegExp(`^Sitemap:\\s*${productionOrigin}/sitemap\\.xml\\s*$`, "m"));

  const groups = parseRobotGroups(robots);
  const wildcard = groups.find((group) => group.userAgents.includes("*"));
  assert.ok(wildcard, "robots.txt must include a wildcard User-agent group");
  assert.ok(
    wildcard.rules.some((rule) => rule === "allow:/" || rule === "disallow:"),
    "wildcard group must allow the public site"
  );

  for (const userAgent of requiredAiUserAgents) {
    const group = groups.find((candidate) => candidate.userAgents.includes(userAgent));
    assert.ok(group, `robots.txt must include an explicit User-agent group for ${userAgent}`);
    assert.ok(
      group.rules.some((rule) => rule.startsWith("allow:") || rule.startsWith("disallow:")),
      `${userAgent} must have Allow or Disallow rules`
    );
    assert.ok(
      group.rules.some((rule) => rule === "allow:/" || rule === "allow:" || rule === "disallow:"),
      `${userAgent} must be allowed to index the public landing page`
    );
  }
});

test("sitemap.xml lists the canonical Loop landing URL", () => {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  assert.match(sitemap, /<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, new RegExp(`<loc>${productionOrigin}/</loc>`));
  assert.doesNotMatch(sitemap, /<loc>https?:\/\/localhost/);
});

test("landing HTML advertises the sitemap and canonical production URL", () => {
  const html = fs.readFileSync(path.join(landingRoot, "index.html"), "utf8");
  assert.match(html, /rel="canonical"\s+href="https:\/\/loop\.twiniti\.ai\/"/);
  assert.match(html, /rel="sitemap"[^>]*href="\/sitemap\.xml"/);
});
