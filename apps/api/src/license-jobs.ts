import type { AppEnv } from "@twiniti/config";
import {
  enqueueJob,
  type Db
} from "@twiniti/db";
import {
  createLicenseApiClient,
  type AgentProvisionInput,
  type AgentRevokeInput,
  type ProvisionOrganizationInput,
  type SubscriptionStateInput
} from "@twiniti/license-api";

export type LicenseProvisionPayload = ProvisionOrganizationInput & { idempotencyKey: string };
export type LicenseAgentProvisionPayload = AgentProvisionInput & { idempotencyKey: string };
export type LicenseAgentRevokePayload = AgentRevokeInput & { idempotencyKey: string };

export async function enqueueLicenseProvisioning(
  db: Db,
  env: AppEnv,
  input: Omit<LicenseProvisionPayload, "idempotencyKey">
) {
  const client = createLicenseApiClient(env);
  if (!client.configured && !client.required) return null;
  const idempotencyKey = `organization-provision:${input.externalOrganizationId}`;
  return enqueueJob(db, {
    organizationId: input.externalOrganizationId,
    kind: "license.provision",
    dedupeKey: idempotencyKey,
    payload: { ...input, idempotencyKey }
  });
}

export async function enqueueLicenseSubscriptionSync(
  db: Db,
  env: AppEnv,
  input: SubscriptionStateInput
) {
  const client = createLicenseApiClient(env);
  if (!client.configured && !client.required) return null;
  const idempotencyKey = `stripe-license-sync:${input.sourceEventId}`;
  return enqueueJob(db, {
    organizationId: input.externalOrganizationId,
    kind: "license.subscription.sync",
    dedupeKey: idempotencyKey,
    payload: { ...input, idempotencyKey }
  });
}

export async function enqueueLicenseAgentProvisioning(
  db: Db,
  env: AppEnv,
  input: Omit<LicenseAgentProvisionPayload, "idempotencyKey">
) {
  const client = createLicenseApiClient(env);
  if (!client.configured && !client.required) return null;
  const idempotencyKey = `agent-provision:${input.externalOrganizationId}:${input.externalAgentId}`;
  return enqueueJob(db, {
    organizationId: input.externalOrganizationId,
    kind: "license.agent.provision",
    dedupeKey: idempotencyKey,
    payload: { ...input, idempotencyKey }
  });
}

export async function enqueueLicenseAgentRevocation(
  db: Db,
  env: AppEnv,
  input: Omit<LicenseAgentRevokePayload, "idempotencyKey">
) {
  const client = createLicenseApiClient(env);
  if (!client.configured && !client.required) return null;
  const idempotencyKey = `agent-revoke:${input.externalOrganizationId}:${input.externalAgentId}`;
  return enqueueJob(db, {
    organizationId: input.externalOrganizationId,
    kind: "license.agent.revoke",
    dedupeKey: idempotencyKey,
    payload: { ...input, idempotencyKey }
  });
}

export { buildSubscriptionState } from "@twiniti/license-api";
