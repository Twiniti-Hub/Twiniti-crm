import test from "node:test";
import assert from "node:assert/strict";
import { resolveForwardTargets, shouldAcknowledgeForward } from "./forwarding.js";

const urls = {
  us: "https://us.example/api/v1/webhooks/stripe",
  eu: "https://eu.example/api/v1/webhooks/stripe",
  uk: "https://uk.example/api/v1/webhooks/stripe"
};

test("resolveForwardTargets routes known region codes", () => {
  assert.deepEqual(resolveForwardTargets("eu", urls), { targeted: true, urls: [urls.eu] });
  assert.deepEqual(resolveForwardTargets("us", urls), { targeted: true, urls: [urls.us] });
  assert.deepEqual(resolveForwardTargets("uk", urls), { targeted: true, urls: [urls.uk] });
});

test("resolveForwardTargets fans out when region metadata is missing", () => {
  assert.deepEqual(resolveForwardTargets(undefined, urls), {
    targeted: false,
    urls: [urls.us, urls.eu, urls.uk]
  });
  assert.deepEqual(resolveForwardTargets("xx", urls), {
    targeted: false,
    urls: [urls.us, urls.eu, urls.uk]
  });
});

test("shouldAcknowledgeForward requires the targeted region to succeed", () => {
  assert.equal(shouldAcknowledgeForward(true, [{ url: urls.eu, ok: true, status: 200 }]).ok, true);
  assert.equal(shouldAcknowledgeForward(true, [{ url: urls.eu, ok: false, status: 500 }]).ok, false);
});

test("shouldAcknowledgeForward accepts fan-out when any region succeeds", () => {
  const summary = shouldAcknowledgeForward(false, [
    { url: urls.us, ok: false, error: "timeout" },
    { url: urls.eu, ok: true, status: 200 },
    { url: urls.uk, ok: false, status: 502 }
  ]);
  assert.equal(summary.ok, true);
  assert.equal(summary.succeeded, 1);
  assert.equal(summary.failed, 2);
});

test("shouldAcknowledgeForward rejects fan-out when every region fails", () => {
  const summary = shouldAcknowledgeForward(false, [
    { url: urls.us, ok: false, status: 500 },
    { url: urls.eu, ok: false, error: "aborted" },
    { url: urls.uk, ok: false, status: 404 }
  ]);
  assert.equal(summary.ok, false);
  assert.equal(summary.succeeded, 0);
  assert.equal(summary.failed, 3);
});
