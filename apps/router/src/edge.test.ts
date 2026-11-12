import assert from "node:assert/strict";
import test from "node:test";
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

test("sleeping app origin 429 on /sign-in becomes a waking page that pings every origin directly", async (t) => {
  t.mock.method(globalThis, "fetch", async () => renderSleeping());
  const response = await router.fetch(new Request("https://loop-dev.test/sign-in", {
    headers: { "User-Agent": chrome, Accept: "text/html,application/xhtml+xml" }
  }), environment());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "15");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  for (const origin of ["https://us.test/health", "https://eu.test/health", "https://uk.test/health"]) {
    assert.ok(html.includes(origin), `waking page pings ${origin}`);
  }
  assert.equal(html.match(/https:\/\/us\.test\/health/g)?.length, 1, "duplicate origins are pinged once");
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

test("/api/v1/me reports discovery unavailable when a sleeping cell answers 429", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: Request | string) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://uk.test")) return renderSleeping();
    return Response.json({ data: { organizationId: null } });
  });
  const response = await router.fetch(new Request("https://loop.test/api/v1/me", { headers: { "User-Agent": chrome } }), environment("production"));
  assert.equal(response.status, 503);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, "workspace_discovery_unavailable");
});
