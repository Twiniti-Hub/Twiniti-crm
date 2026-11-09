import assert from "node:assert/strict";
import test from "node:test";
import { validateWebVisitorInstallation } from "../web-visitor-installation.js";

const key = "R6G5YH5RVG65";
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

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
