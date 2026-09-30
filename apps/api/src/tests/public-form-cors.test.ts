import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppEnv } from "@twiniti/config";
import {
  PUBLIC_FORM_MARKETING_ORIGINS,
  allowedCorsOriginsForPath,
  isPublicFormCorsRoute
} from "../public-form-cors.js";

const env = {
  WEB_ORIGIN: "https://twiniti-crm-prod-us.onrender.com"
} as AppEnv;

test("public form routes are detected", () => {
  assert.equal(isPublicFormCorsRoute("/api/v1/public/forms/contact-us"), true);
  assert.equal(isPublicFormCorsRoute("/api/v1/public/forms/contact-us/submit"), true);
  assert.equal(isPublicFormCorsRoute("/api/v1/public/website-contact"), true);
  assert.equal(isPublicFormCorsRoute("/api/v1/public/forms"), false);
  assert.equal(isPublicFormCorsRoute("/api/v1/contacts"), false);
});

test("CRM routes keep WEB_ORIGIN only", () => {
  assert.deepEqual(allowedCorsOriginsForPath("/api/v1/contacts", env), [
    "https://twiniti-crm-prod-us.onrender.com"
  ]);
});

test("website contact route adds marketing origins", () => {
  const allowed = allowedCorsOriginsForPath("/api/v1/public/website-contact", env);
  for (const origin of PUBLIC_FORM_MARKETING_ORIGINS) {
    assert.ok(allowed.includes(origin), `missing ${origin}`);
  }
});

test("public form routes add marketing origins without dropping CRM origin", () => {
  const allowed = allowedCorsOriginsForPath("/api/v1/public/forms/demo/submit", env);
  assert.equal(allowed[0], "https://twiniti-crm-prod-us.onrender.com");
  for (const origin of PUBLIC_FORM_MARKETING_ORIGINS) {
    assert.ok(allowed.includes(origin), `missing ${origin}`);
  }
  assert.equal(allowed.length, 1 + PUBLIC_FORM_MARKETING_ORIGINS.length);
});
