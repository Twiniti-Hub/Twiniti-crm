import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import router, { type Env } from "./index";

function environment(deploymentEnv = "development") {
  return {
    DEFAULT_REGION: "us",
    DEPLOYMENT_ENV: deploymentEnv,
    WEB_ORIGIN: "https://web.test",
    APP_ORIGIN: "https://us.test",
    API_ORIGIN_US: "https://us.test",
    API_ORIGIN_EU: "https://eu.test",
    API_ORIGIN_UK: "https://uk.test",
    WORKSPACE_DIRECTORY: { get: async () => null, put: async () => {} }
  } as unknown as Env;
}

const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
const renderSleeping = () => new Response("Too Many Requests", { status: 429 });

test("sleeping app origin 429 on /sign-in: one origin fetch, waking page pings only APP_ORIGIN", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => renderSleeping());
  const response = await router.fetch(new Request("https://loop-dev.test/sign-in", {
    headers: { "User-Agent": chrome, Accept: "text/html,application/xhtml+xml" }
  }), environment());
  assert.equal(fetchMock.mock.callCount(), 1, "the Worker sends no extra wake requests");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.equal(html.match(/https:\/\/[a-z]+\.test\/health/g)?.join(","), "https://us.test/health");
  assert.ok(!html.includes("eu.test") && !html.includes("uk.test"), "other regions are never woken");
});

test("waking page polls with a bounded timeout chain and reloads once", async (t) => {
  t.mock.method(globalThis, "fetch", async () => renderSleeping());
  const html = await (await router.fetch(new Request("https://loop-dev.test/sign-in", {
    headers: { "User-Agent": chrome, Accept: "text/html" }
  }), environment())).text();
  assert.match(html, /INTERVAL = 3000/);
  assert.match(html, /DEADLINE = 90000/);
  assert.match(html, /status === 200/);
  assert.equal(html.match(/location\.reload\(\)/g)?.length, 1);
  for (const forbidden of ["setInterval", "serviceWorker", "http-equiv=\"refresh\"", "sendBeacon"]) {
    assert.ok(!html.includes(forbidden), `waking page must not use ${forbidden}`);
  }
});

test("crawlers hitting a sleeping origin in production get a plain 503 with no script", async (t) => {
  t.mock.method(globalThis, "fetch", async () => renderSleeping());
  const response = await router.fetch(new Request("https://loop.test/sign-in", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", Accept: "text/html" }
  }), environment("production"));
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.ok(!body.includes("<script") && !body.includes("/health"));
});

test("/health/app forwards one readiness GET to APP_ORIGIN and maps it to 200/503", async (t) => {
  const visited: string[] = [];
  let status = 429;
  t.mock.method(globalThis, "fetch", async (input: Request | string) => {
    visited.push(String(input instanceof Request ? input.url : input));
    return new Response(null, { status });
  });
  const ask = () => router.fetch(new Request("https://loop-dev.test/health/app", { headers: { "User-Agent": chrome } }), environment());
  assert.equal((await ask()).status, 503);
  status = 200;
  assert.equal((await ask()).status, 200);
  assert.deepEqual(visited, ["https://us.test/health", "https://us.test/health"]);
});

test("crawlers cannot use /health/app in any environment", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const response = await router.fetch(new Request("https://loop.test/health/app", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; bingbot/2.0)" }
  }), environment("production"));
  assert.equal(response.status, 403);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("no scheduled handler and no cron triggers anywhere in the router", async () => {
  assert.equal((router as Record<string, unknown>).scheduled, undefined);
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.doesNotMatch(config, /triggers|crons/i);
});

test("awake app origin passes /sign-in through with the app surface cookie", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>app</html>", { status: 200 }));
  const response = await router.fetch(new Request("https://loop-dev.test/sign-in", {
    headers: { "User-Agent": chrome, Accept: "text/html" }
  }), environment());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<html>app</html>");
  assert.match(response.headers.get("set-cookie") ?? "", /twiniti_surface=app/);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("asset 429 is passed through rather than replaced with HTML", async (t) => {
  t.mock.method(globalThis, "fetch", async () => renderSleeping());
  const response = await router.fetch(new Request("https://loop-dev.test/assets/index.js", {
    headers: { "User-Agent": chrome, Accept: "application/javascript", Cookie: "twiniti_surface=app" }
  }), environment());
  assert.equal(response.status, 429);
});

test("development blocks named crawlers before reaching Render", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("unexpected"));
  for (const ua of [
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  ]) {
    const response = await router.fetch(new Request("https://loop-dev.test/sign-in", { headers: { "User-Agent": ua } }), environment());
    assert.equal(response.status, 403, ua);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("development serves a disallow-all robots.txt without proxying", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("landing robots"));
  const response = await router.fetch(new Request("https://loop-dev.test/robots.txt"), environment());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "User-agent: *\nDisallow: /\n");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("production keeps crawlers and the landing robots.txt", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("landing robots"));
  const robots = await router.fetch(new Request("https://loop.test/robots.txt"), environment("production"));
  assert.equal(await robots.text(), "landing robots");
  const crawled = await router.fetch(new Request("https://loop.test/", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; OAI-SearchBot/1.0)" }
  }), environment("production"));
  assert.equal(crawled.status, 200);
  assert.equal(crawled.headers.get("x-robots-tag"), null);
});
