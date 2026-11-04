import assert from "node:assert/strict";
import test from "node:test";
import router, { discoverWorkspace, type Env } from "./index";

const org = "00000000-0000-4000-8000-000000000001";
function environment() {
  const writes: unknown[] = [];
  const env = {
    API_ORIGIN_US: "https://us.test", API_ORIGIN_EU: "https://eu.test", API_ORIGIN_UK: "https://uk.test",
    WORKSPACE_DIRECTORY: { get: async () => null, put: async (...args: unknown[]) => { writes.push(args); } }
  } as unknown as Env;
  return { env, writes };
}

test("an unavailable US cell does not hide a UK workspace; all probes start concurrently", async (t) => {
  const { env, writes } = environment();
  const visited: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    visited.push(String(url));
    if (String(url).startsWith("https://us.test")) {
      return new Promise<Response>((_, reject) => {
        init.signal!.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
      });
    }
    return Response.json({ data: String(url).startsWith("https://uk.test") ? { organizationId: org, regionCode: "uk" } : { needsSetup: true } });
  });
  // Keep Node alive while the unref'ed AbortSignal timeout fires.
  const hold = setTimeout(() => {}, 1000);
  try {
    const response = await discoverWorkspace(new Request("https://loop.test/api/v1/me"), env, 20);
    assert.equal(visited.length, 3);
    assert.equal((await response.json() as any).data.organizationId, org);
    assert.deepEqual(writes, [[org, "uk"]]);
  } finally { clearTimeout(hold); }
});

test("missing regional response does not incorrectly send the user to new-workspace setup", async (t) => {
  const { env } = environment();
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (String(url).startsWith("https://eu.test")) throw new Error("offline");
    return Response.json({ data: { needsSetup: true } });
  });
  assert.equal((await discoverWorkspace(new Request("https://loop.test/api/v1/me"), env)).status, 503);
});

test("missing KV mapping is rediscovered for /me instead of trapping sign-in", async (t) => {
  const { env } = environment();
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: { organizationId: org, regionCode: "us" } }));
  const response = await router.fetch(new Request("https://loop.test/api/v1/me", {
    headers: { "X-Twiniti-Workspace-Id": org }
  }), env);
  assert.equal(response.status, 200);
});

test("unauthenticated regional replies return 401 without a fourth probe", async (t) => {
  const { env } = environment();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ error: "unauthorized" }, { status: 401 }); });
  assert.equal((await discoverWorkspace(new Request("https://loop.test/api/v1/me"), env)).status, 401);
  assert.equal(calls, 3);
});
