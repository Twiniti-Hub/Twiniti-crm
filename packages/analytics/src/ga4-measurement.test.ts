import assert from "node:assert/strict";
import test from "node:test";
import { sendGa4FunnelEvents } from "./ga4-measurement.js";

test("sendGa4FunnelEvents does not call the network when deliver is false", async () => {
  let called = false;
  const result = await sendGa4FunnelEvents(
    {
      measurementId: "G-TEST",
      apiSecret: "secret",
      deliver: false,
      fetchFn: async () => {
        called = true;
        return new Response(null, { status: 204 });
      }
    },
    [{ name: "sign_up", clientId: "subj-1" }]
  );
  assert.equal(called, false);
  assert.equal(result.sent, false);
  assert.deepEqual(result.debug?.events, ["sign_up"]);
});

test("sendGa4FunnelEvents posts funnel events when deliver is true", async () => {
  let url = "";
  let payload = "";
  const result = await sendGa4FunnelEvents(
    {
      measurementId: "G-PROD",
      apiSecret: "sec",
      deliver: true,
      trafficType: "internal",
      fetchFn: async (input, init) => {
        url = String(input);
        payload = String(init?.body);
        return new Response(null, { status: 204 });
      }
    },
    [{ name: "begin_checkout", clientId: "org-1", params: { workspace_kind: "personal" } }]
  );
  assert.equal(result.sent, true);
  assert.match(url, /measurement_id=G-PROD/);
  assert.match(url, /api_secret=sec/);
  assert.match(payload, /"name":"begin_checkout"/);
  assert.match(payload, /"traffic_type":"internal"/);
});