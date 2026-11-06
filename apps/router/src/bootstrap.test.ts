import assert from "node:assert/strict";
import test from "node:test";
import router, { regionForCountry, type Env } from "./index";

const org = "00000000-0000-4000-8000-000000000099";

function environment() {
  const writes: unknown[] = [];
  const env = {
    DEFAULT_REGION: "us",
    DEPLOYMENT_ENV: "test",
    WEB_ORIGIN: "https://web.test",
    APP_ORIGIN: "https://app.test",
    API_ORIGIN_US: "https://us.test",
    API_ORIGIN_EU: "https://eu.test",
    API_ORIGIN_UK: "https://uk.test",
    WORKSPACE_DIRECTORY: {
      get: async () => null,
      put: async (...args: unknown[]) => { writes.push(args); }
    }
  } as unknown as Env;
  return { env, writes };
}

test("regionForCountry maps GB→uk, DE→eu, US→us", () => {
  assert.equal(regionForCountry("GB"), "uk");
  assert.equal(regionForCountry("de"), "eu");
  assert.equal(regionForCountry("US"), "us");
});

test("POST /api/v1/organizations without workspace header proxies (not 409) and seeds KV", async (t) => {
  const { env, writes } = environment();
  const visited: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    visited.push(String(url));
    return Response.json({ data: { id: org, regionCode: "uk" } }, { status: 201 });
  });
  const response = await router.fetch(new Request("https://loop.test/api/v1/organizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Smoke", countryCode: "GB", joinAsAdmin: true, workspaceKind: "personal" })
  }), env);
  assert.equal(response.status, 201);
  assert.ok(visited.some((u) => u.startsWith("https://uk.test")));
  assert.ok(!visited.some((u) => u.startsWith("https://us.test") || u.startsWith("https://eu.test")));
  assert.deepEqual(writes, [[org, "uk"]]);
});

test("POST create with DE routes to EU", async (t) => {
  const { env } = environment();
  const visited: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    visited.push(String(url));
    return Response.json({ data: { id: org, regionCode: "eu" } }, { status: 201 });
  });
  const response = await router.fetch(new Request("https://loop.test/api/v1/organizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "EU Co", countryCode: "DE", joinAsAdmin: true })
  }), env);
  assert.equal(response.status, 201);
  assert.ok(visited.every((u) => u.startsWith("https://eu.test")));
});

test("POST create with US routes to US", async (t) => {
  const { env } = environment();
  const visited: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    visited.push(String(url));
    return Response.json({ data: { id: org, regionCode: "us" } }, { status: 201 });
  });
  const response = await router.fetch(new Request("https://loop.test/api/v1/organizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "US Co", countryCode: "US", joinAsAdmin: true })
  }), env);
  assert.equal(response.status, 201);
  assert.ok(visited.every((u) => u.startsWith("https://us.test")));
});

test("unrelated API without workspace header still returns 409", async () => {
  const { env } = environment();
  const response = await router.fetch(new Request("https://loop.test/api/v1/contacts"), env);
  assert.equal(response.status, 409);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, "workspace_context_required");
});

test("GET invitation lookup without workspace header fans out (not 409)", async (t) => {
  const { env } = environment();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls++;
    if (String(url).startsWith("https://uk.test")) {
      return Response.json({ data: { token: "ok" } }, { status: 200 });
    }
    return Response.json({ error: "missing" }, { status: 404 });
  });
  const response = await router.fetch(new Request("https://loop.test/api/v1/invitations/tok_abc"), env);
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});
