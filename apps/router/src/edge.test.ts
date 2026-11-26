import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import router, { type Env, isKnownGuestAppDocument } from "./index";
import { wantsDocument } from "./edge";

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

const shellHtml = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");
const htmlResponse = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers } });
const hasNoindexMeta = (html: string) => /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
const sessionCookie = "__Host-hexclave-refresh-abc=1";

test("the app shell itself ships noindex, so loop.us/loop.eu stay out of search without the router", () => {
  assert.ok(hasNoindexMeta(shellHtml));
});

test("production: public pages served by the app shell are indexable (no meta, no header)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => htmlResponse(shellHtml, { "x-robots-tag": "noindex" }));
  for (const [path, cookie] of [["/sign-up", ""], ["/sign-in", ""], ["/pricing", ""], ["/pricing/", ""], ["/", sessionCookie]] as const) {
    const response = await router.fetch(new Request(`https://loop.test${path}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", Accept: "text/html", Cookie: cookie }
    }), environment("production"));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-robots-tag"), null, path);
    const html = await response.text();
    assert.ok(!hasNoindexMeta(html), `${path} must not carry a noindex meta`);
    assert.ok(html.includes('<div id="root">'), `${path} still serves the shell`);
  }
});

test("production: anonymous / on the landing origin is untouched and indexable", async (t) => {
  const visited: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => { visited.push(String(url)); return htmlResponse("<html><head></head><body>Loop</body></html>"); });
  const response = await router.fetch(new Request("https://loop.test/", { headers: { Accept: "text/html" } }), environment("production"));
  assert.ok(visited[0]!.startsWith("https://web.test/"));
  assert.equal(response.headers.get("x-robots-tag"), null);
});

test("production: signed-in app pages get X-Robots-Tag noindex; assets do not", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => String(url).includes("/assets/")
    ? new Response("console.log(1)", { headers: { "content-type": "text/javascript" } })
    : htmlResponse(shellHtml));
  for (const path of ["/contacts", "/settings", "/onboarding", "/handler/email-verification", "/forgot-password"]) {
    const response = await router.fetch(new Request(`https://loop.test${path}`, { headers: { Accept: "text/html", Cookie: sessionCookie } }), environment("production"));
    assert.equal(response.headers.get("x-robots-tag"), "noindex", path);
    assert.ok(hasNoindexMeta(await response.text()), path);
  }
  const asset = await router.fetch(new Request("https://loop.test/assets/index.js", { headers: { Cookie: sessionCookie } }), environment("production"));
  assert.equal(asset.headers.get("x-robots-tag"), null);
});

test("non-production hosts stay noindex everywhere, public paths included", async (t) => {
  t.mock.method(globalThis, "fetch", async () => htmlResponse(shellHtml));
  const response = await router.fetch(new Request("https://loop-dev.test/sign-up", { headers: { "User-Agent": chrome, Accept: "text/html" } }), environment());
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("production: HEAD mirrors GET for public app routes", async (t) => {
  t.mock.method(globalThis, "fetch", async () => htmlResponse(shellHtml));
  const get = await router.fetch(new Request("https://loop.test/sign-up", {
    headers: { "User-Agent": chrome, Accept: "text/html" }
  }), environment("production"));
  const head = await router.fetch(new Request("https://loop.test/sign-up", {
    method: "HEAD",
    headers: { "User-Agent": chrome, Accept: "text/html" }
  }), environment("production"));
  assert.equal(get.status, 200);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("wantsDocument is false for subresource */* requests", () => {
  const request = new Request("https://loop.test/assets/index.js", { headers: { Accept: "*/*" } });
  assert.equal(wantsDocument(request), false);
});

test("isKnownGuestAppDocument allows /handler and nested handler routes", () => {
  assert.equal(isKnownGuestAppDocument("/handler"), true);
  assert.equal(isKnownGuestAppDocument("/handler/email-verification"), true);
});

test("production: anonymous app assets are not rejected as guest 404", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("bundle", { status: 200 }));
  const response = await router.fetch(new Request("https://loop.test/assets/index-abc.js", {
    headers: { "User-Agent": chrome, Accept: "*/*", Cookie: "twiniti_surface=app" }
  }), environment("production"));
  assert.equal(response.status, 200);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("production: anonymous unknown app paths return 404", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => htmlResponse(shellHtml));
  const response = await router.fetch(new Request("https://loop.test/this-does-not-exist-123", {
    headers: { "User-Agent": chrome, Accept: "text/html" }
  }), environment("production"));
  assert.equal(response.status, 404);
  assert.equal(fetchMock.mock.callCount(), 0);
});
