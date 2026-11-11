import assert from "node:assert/strict";
import test from "node:test";
import { validateWebVisitorInstallation } from "../web-visitor-installation.js";
import { requestPinned } from "../web-visitor-installation.js";
import { buildWebVisitorLoaderSnippet } from "@twiniti/db";
import { createServer } from "node:http";
import { once } from "node:events";
import Fastify from "fastify";
import { createWebVisitorLimiter, safeRequestSerializers } from "../web-visitor-security.js";
import { registerWebVisitorRoutes } from "../routes/web-visitors.js";
import { webVisitorIntegrations, hashCredential, type Db } from "@twiniti/db";
import { randomBytes } from "node:crypto";

const key = "R6G5YH5RVG65";
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("saved webhook survives reload/settings save and rotation preserves website code", async () => {
  let stored: Record<string, unknown> | undefined;
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => stored ? [stored] : [] }) }) }),
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => {
      if (table === webVisitorIntegrations) stored = { id: "integration", ...values };
      return { returning: async () => [stored] };
    } }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => { stored = { ...stored, ...values }; return [stored]; } }) }) })
  } as unknown as Db;
  const app = Fastify();
  let role = "admin";
  app.addHook("onRequest", async (request) => {
    request.actor = { type: "user", id: "admin", role, organizationId: "org" } as NonNullable<typeof request.actor>;
  });
  await registerWebVisitorRoutes(app, db, randomBytes(32).toString("base64"));
  const path = "/api/v1/organization/integrations/web-visitors";
  try {
    const saved = await app.inject({ method: "PUT", url: path, payload: { enabled: true, publicKey: key } });
    assert.equal(saved.statusCode, 200);
    const initial = saved.json().data;
    assert.ok(initial.webhookToken.startsWith("wv_"));
    assert.notEqual(stored!.webhookTokenCiphertext, initial.webhookToken);
    assert.equal(stored!.webhookTokenHash, hashCredential(initial.webhookToken));
    const loaded = await app.inject({ method: "GET", url: path });
    assert.equal(loaded.headers["cache-control"], "no-store");
    assert.equal(loaded.json().data.webhookToken, initial.webhookToken);
    const updated = await app.inject({ method: "PUT", url: path, payload: { enabled: false } });
    assert.equal(updated.json().data.webhookToken, initial.webhookToken);
    const rotated = await app.inject({ method: "POST", url: `${path}/rotate-webhook-token`, payload: {} });
    assert.equal(rotated.statusCode, 200);
    assert.notEqual(rotated.json().data.webhookToken, initial.webhookToken);
    assert.equal(rotated.json().data.loaderSnippet, initial.loaderSnippet);
    assert.equal((await app.inject({ method: "GET", url: path })).json().data.webhookToken, rotated.json().data.webhookToken);
    delete stored!.webhookTokenCiphertext;
    const legacy = (await app.inject({ method: "GET", url: path })).json().data;
    assert.equal(legacy.webhookNeedsRotation, true);
    assert.equal(legacy.webhookToken, null);
    role = "member";
    assert.equal((await app.inject({ method: "GET", url: path })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: `${path}/rotate-webhook-token`, payload: {} })).statusCode, 403);
  } finally { await app.close(); }
});

test("accepts the actual customer snippet and rejects wrong keys and comments", async () => {
  const snippet = buildWebVisitorLoaderSnippet({ publicKey: key });
  for (const [html, expected] of [[snippet, "installed"], [snippet.replace(key, "WRONGKEY"), "missing"], [`<!--${snippet}-->`, "missing"]]) {
    const result = await validateWebVisitorInstallation({ websiteUrl: "https://example.com", publicKey: key, lookup: publicLookup, fetch: async () => new Response(html, { headers: { "content-type": "text/html" } }) });
    assert.equal(result.status, expected);
  }
});

test("real pinned HTTP transport handles hostname lookup and bodyless responses", async () => {
  const server = createServer((req, res) => { res.statusCode = Number(req.url?.slice(1)) || 200; res.end(res.statusCode === 200 ? "ok" : undefined); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    for (const status of [200, 204, 205, 304]) {
      const response = await requestPinned(new URL(`http://fixture.invalid:${address.port}/${status}`), [{ address: "127.0.0.1", family: 4 }], AbortSignal.timeout(2000));
      assert.equal(response.status, status);
      assert.equal(await response.text(), status === 200 ? "ok" : "");
    }
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("webhook limits expire and cannot grow beyond capacity", () => {
  const allow = createWebVisitorLimiter(2, 2, 100);
  assert.equal(allow("a", 0), true);
  assert.equal(allow("a", 1), true);
  assert.equal(allow("a", 2), false);
  assert.equal(allow("b", 3), true);
  assert.equal(allow("c", 4), false);
  assert.equal(allow("c", 101), true);
  assert.equal(allow("a", 104), true);
});

test("Fastify request and error logs do not expose webhook tokens", async () => {
  const logs: string[] = [];
  const app = Fastify({ logger: { serializers: safeRequestSerializers, stream: { write: (line: string) => logs.push(line) } } });
  app.post("/api/v1/webhooks/web-visitors/:token", async (request) => { throw new Error(`Failed ${request.url}`); });
  try {
    await app.inject({ method: "POST", url: "/api/v1/webhooks/web-visitors/wv_SECRET" });
    await app.inject({ method: "POST", url: "/api/v1/webhooks/web-visitors/wv_SECRET", headers: { "content-type": "application/json" }, payload: "{" });
    assert.ok(logs.length > 0);
    assert.equal(logs.join("").includes("wv_SECRET"), false);
    assert.ok(logs.join("").includes("[REDACTED]"));
  } finally { await app.close(); }
});

test("reports installed only when the organization loader URL is in HTML", async () => {
  const fetch = async () => new Response(`<script src="https://ddwl4m2hdecbv.cloudfront.net/b/${key}/${key}.js.gz"></script>`, { headers: { "content-type": "text/html" } });
  const result = await validateWebVisitorInstallation({ websiteUrl: "https://example.com", publicKey: key, lookup: publicLookup, fetch });
  assert.equal(result.status, "installed");
});

test("reports a missing loader without executing page JavaScript", async () => {
  const fetch = async () => new Response("<html><body>Published page</body></html>", { headers: { "content-type": "text/html" } });
  const result = await validateWebVisitorInstallation({ websiteUrl: "https://example.com", publicKey: key, lookup: publicLookup, fetch });
  assert.equal(result.status, "missing");
});

test("blocks credentialed, loopback, private and mixed DNS targets before fetch", async () => {
  let fetchCount = 0;
  const fetch = async () => { fetchCount += 1; return new Response("ok"); };
  const cases = [
    { websiteUrl: "https://user:pass@example.com", lookup: publicLookup },
    { websiteUrl: "http://127.0.0.1", lookup: publicLookup },
    { websiteUrl: "http://[::1]", lookup: publicLookup },
    { websiteUrl: "https://internal.example", lookup: async () => [{ address: "10.1.2.3", family: 4 }] },
    { websiteUrl: "https://mixed.example", lookup: async () => [{ address: "93.184.216.34", family: 4 }, { address: "169.254.169.254", family: 4 }] }
  ];
  for (const candidate of cases) {
    const result = await validateWebVisitorInstallation({ ...candidate, publicKey: key, fetch });
    assert.equal(result.status, "blocked", candidate.websiteUrl);
  }
  assert.equal(fetchCount, 0);
});

test("revalidates every redirect target and blocks redirects to private hosts", async () => {
  const fetch = async () => new Response(null, { status: 302, headers: { location: "http://10.0.0.8/private" } });
  const result = await validateWebVisitorInstallation({ websiteUrl: "https://example.com", publicKey: key, lookup: publicLookup, fetch });
  assert.equal(result.status, "blocked");
});

test("rejects non-HTML and oversized responses", async () => {
  const nonHtml = await validateWebVisitorInstallation({ websiteUrl: "https://example.com", publicKey: key, lookup: publicLookup, fetch: async () => new Response("{}", { headers: { "content-type": "application/json" } }) });
  assert.equal(nonHtml.status, "non_html");
  const oversized = await validateWebVisitorInstallation({ websiteUrl: "https://example.com", publicKey: key, lookup: publicLookup, fetch: async () => new Response("x".repeat(512 * 1024 + 1), { headers: { "content-type": "text/html" } }) });
  assert.equal(oversized.status, "too_large");
});

test("bounds slow checks with an abort timeout", async () => {
  const fetch = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
  const result = await validateWebVisitorInstallation({ websiteUrl: "https://example.com", publicKey: key, lookup: publicLookup, fetch, timeoutMs: 5 });
  assert.equal(result.status, "timeout");
});
