import type { AppEnv } from "@twiniti/config";
import {
  completeJob,
  enqueueJob,
  updateOrganizationLicense,
  type Db
} from "@twiniti/db";
import { createLicenseApiClient, type ProvisionOrganizationInput, type SubscriptionStateInput } from "@twiniti/license-api";

export type LicenseProvisionPayload = ProvisionOrganizationInput & { idempotencyKey: string };

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

export function buildSubscriptionState(
  billing: {
    organizationId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    status: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  },
  input: { eventId: string; eventCreatedAt: Date; gracePeriodDays: number }
): SubscriptionStateInput {
  const status = billing.status === "trialing" ? "trialing"
    : billing.status === "active" ? "active"
      : billing.status === "past_due" ? "grace"
        : billing.status === "canceled" ? "expired" : "pending";
  const periodEnd = billing.currentPeriodEnd?.toISOString() ?? null;
  const graceStart = Math.max(input.eventCreatedAt.getTime(), billing.currentPeriodEnd?.getTime() ?? 0);
  const graceCutoff = status === "grace"
    ? new Date(graceStart + input.gracePeriodDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const expiresAt = billing.cancelAtPeriodEnd && billing.currentPeriodEnd
    ? billing.currentPeriodEnd.toISOString()
    : status === "expired" ? periodEnd ?? input.eventCreatedAt.toISOString() : null;
  return {
    externalOrganizationId: billing.organizationId,
    stripeCustomerId: billing.stripeCustomerId,
    stripeSubscriptionId: billing.stripeSubscriptionId,
    stripePriceId: billing.stripePriceId,
    normalizedState: status,
    periodEnd,
    expiresAt,
    graceCutoff,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    sourceEventId: input.eventId,
    eventCreatedAt: input.eventCreatedAt.toISOString(),
    source: "twiniti-crm"
  };
}

function responseString(data: unknown, keys: string[]) {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key];
  }
  return null;
}

export async function processLicenseProvisioning(
  db: Db,
  env: AppEnv,
  payload: LicenseProvisionPayload,
  jobId: string
) {
  const client = createLicenseApiClient(env);
  const result = await client.provisionOrganization(payload, payload.idempotencyKey);
  await updateOrganizationLicense(db, payload.externalOrganizationId, {
    licenseProvisioningStatus: "provisioned",
    licenseOrganizationId: responseString(result, ["organizationId", "organization_id", "id"]),
    licenseId: responseString(result, ["licenseId", "license_id"]),
    licenseUserId: responseString(result, ["userId", "user_id"])
  });
  await completeJob(db, jobId);
  return result;
}

export async function processLicenseSubscriptionSync(
  db: Db,
  env: AppEnv,
  payload: SubscriptionStateInput & { idempotencyKey: string },
  jobId: string
) {
  const client = createLicenseApiClient(env);
  const result = await client.synchronizeSubscriptionState(payload, payload.idempotencyKey);
  await updateOrganizationLicense(db, payload.externalOrganizationId, {
    licenseProvisioningStatus: "provisioned",
    lastLicenseSyncAt: new Date()
  });
  await completeJob(db, jobId);
  return result;
}
