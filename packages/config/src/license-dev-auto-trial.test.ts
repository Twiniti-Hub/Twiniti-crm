import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionApiConfiguration, isLicenseDevAutoTrialEnabled, loadEnv } from "./index.js";

test("isLicenseDevAutoTrialEnabled is false in production even when the flag is set", () => {
  const env = loadEnv({
    DEPLOYMENT_ENV: "production",
    LICENSE_DEV_AUTO_TRIAL: "true"
  });
  assert.equal(isLicenseDevAutoTrialEnabled(env), false);
});

test("isLicenseDevAutoTrialEnabled follows the flag when DEPLOYMENT_ENV is development", () => {
  const enabled = loadEnv({
    DEPLOYMENT_ENV: "development",
    LICENSE_DEV_AUTO_TRIAL: "true"
  });
  assert.equal(isLicenseDevAutoTrialEnabled(enabled), true);

  const disabled = loadEnv({
    DEPLOYMENT_ENV: "development",
    LICENSE_DEV_AUTO_TRIAL: "false"
  });
  assert.equal(isLicenseDevAutoTrialEnabled(disabled), false);
});

test("isLicenseDevAutoTrialEnabled stays off on Render dev APIs (NODE_ENV production, DEPLOYMENT_ENV development)", () => {
  const withoutFlag = loadEnv({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "development",
    LICENSE_DEV_AUTO_TRIAL: "false"
  });
  assert.equal(isLicenseDevAutoTrialEnabled(withoutFlag), false);

  const withFlag = loadEnv({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "development",
    LICENSE_DEV_AUTO_TRIAL: "true"
  });
  assert.equal(isLicenseDevAutoTrialEnabled(withFlag), true);
});

test("assertProductionApiConfiguration rejects LICENSE_DEV_AUTO_TRIAL in production", () => {
  const env = loadEnv({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    AUTH_DISABLED: "false",
    HEXCLAVE_PROJECT_ID: "proj",
    HEXCLAVE_SECRET_SERVER_KEY: "secret",
    VITE_HEXCLAVE_PROJECT_ID: "proj",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec",
    STRIPE_PRICE_ID: "price",
    STRIPE_PERSONAL_PRICE_ID: "price_personal",
    STRIPE_PERSONAL_ORG_MEMBER_PRICE_ID: "price_personal_discount",
    DATABASE_URL_Prod_US: "postgres://example",
    LICENSE_API_URL: "https://license.example.test",
    LICENSE_API_API_KEY: "key",
    LICENSE_DEV_AUTO_TRIAL: "true",
    WEB_ORIGIN: "https://loop.twiniti.ai"
  });
  assert.throws(
    () => assertProductionApiConfiguration(env),
    /Production API forbids LICENSE_DEV_AUTO_TRIAL/
  );
});
