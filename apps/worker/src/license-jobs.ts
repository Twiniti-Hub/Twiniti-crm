import type { AppEnv } from "@twiniti/config";
import {
  getLicensePrincipal, getOrganizationById, listOrgMembers, saveLicenseVerification,
  updateOrganizationLicense, enqueueLicenseVerification, getOrganizationBilling, type Db
} from "@twiniti/db";
import {
  createLicenseApiClient, LicenseApiError, recordVerification, buildSubscriptionState, licenseErrorDecision,
  type LicenseVerification, type ProvisionOrganizationInput, type SubscriptionStateInput
} from "@twiniti/license-api";

const store = { getLicensePrincipal, getOrganizationById, getOrganizationBilling, listOrgMembers, saveLicenseVerification, updateOrganizationLicense, enqueueLicenseVerification };

function returnedIds(result: Record<string, unknown>) {
  const org = result.organization as Record<string, unknown> | undefined;
  const user = result.user as Record<string, unknown> | undefined;
  const license = result.license as Record<string, unknown> | undefined;
  const read = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value.length > 0);
  const organizationId = read(result.organizationId, result.organization_id, org?.id);
  const userId = read(result.userId, result.user_id, user?.id);
  const licenseId = read(result.licenseId, result.license_id, license?.id);
  return {
    ...(organizationId ? { licenseOrganizationId: organizationId } : {}),
    ...(userId ? { licenseUserId: userId } : {}),
    ...(licenseId ? { licenseId } : {})
  };
}

export function licenseJobHandlers(db: Db, env: AppEnv, deps = store, client = createLicenseApiClient(env)) {
  async function provision(input: ProvisionOrganizationInput, key: string) {
    const result = await client.provisionOrganization(input, key);
    const ids = returnedIds(result);
    await deps.updateOrganizationLicense(db, input.externalOrganizationId, {
      ...ids, licenseProvisioningStatus: ids.licenseOrganizationId && ids.licenseUserId ? "provisioned" : "pending"
    });
    return result;
  }

  async function provisionPrincipal(organizationId: string, userId: string) {
    const principal = await deps.getLicensePrincipal(db, organizationId, userId);
    const organization = await deps.getOrganizationById(db, organizationId);
    if (!principal || !organization) throw new Error("License provisioning requires an active workspace member");
    await provision({
      externalOrganizationId: organizationId, organizationName: organization.name,
      billingEmail: principal.email, externalUserId: principal.id, userSubject: principal.hexclaveSubject,
      userEmail: principal.email, userDisplayName: principal.displayName,
      productCode: env.LICENSE_API_PRODUCT_CODE, planCode: env.LICENSE_API_PLAN_CODE, source: "twiniti-crm"
    }, `organization-user-provision:${organizationId}:${principal.id}`);
    return principal;
  }

  async function verify(organizationId: string, userId: string) {
    const principal = await deps.getLicensePrincipal(db, organizationId, userId);
    if (!principal) return;
    const previous = principal.licenseVerification as LicenseVerification | null;
    let current = previous;
    try {
      if (!previous?.check || previous.failureReason === "LICENSE_OR_USER_NOT_FOUND") {
        await provisionPrincipal(organizationId, userId);
        const billing = await deps.getOrganizationBilling(db, organizationId);
        if (billing?.stripeSubscriptionId) {
          const eventId = `license-recovery:${billing.stripeSubscriptionId}:${billing.lastStripeEventCreatedAt?.getTime() ?? 0}:${billing.status}`;
          const state = buildSubscriptionState(billing, {
            eventId, eventCreatedAt: billing.lastStripeEventCreatedAt ?? billing.createdAt,
            gracePeriodDays: env.LICENSE_API_GRACE_PERIOD_DAYS
          });
          const synced = await client.synchronizeSubscriptionState(state, eventId);
          await deps.updateOrganizationLicense(db, organizationId, { ...returnedIds(synced), lastLicenseSyncAt: new Date() });
        }
      }
      const checkInput = {
        externalOrganizationId: organizationId, externalUserId: userId,
        userSubject: principal.hexclaveSubject, email: principal.email,
        productCode: env.LICENSE_API_PRODUCT_CODE, source: "twiniti-crm" as const
      };
      let check = await client.checkUserLicense(checkInput, { fresh: true });
      if (check.reasonCode === "LICENSE_OR_USER_NOT_FOUND") {
        await provisionPrincipal(organizationId, userId);
        check = await client.checkUserLicense(checkInput, { fresh: true });
      }
      current = recordVerification(previous, check);
      await deps.saveLicenseVerification(db, organizationId, userId, current);
      if (check.decision === "retry" || check.reasonCode === "LICENSE_OR_USER_NOT_FOUND") {
        throw new LicenseApiError(check.reasonCode, { requestId: check.requestId, code: check.reasonCode, status: check.httpStatus });
      }
      await deps.updateOrganizationLicense(db, organizationId, {
        ...returnedIds(check as unknown as Record<string, unknown>),
        licenseDecision: check.decision, licenseStatus: check.licenseStatus ?? null,
        ...(check.decision === "allow" ? { licenseProvisioningStatus: "provisioned" } : {}),
        licenseReasonCode: check.reasonCode, lastLicenseCheckedAt: new Date()
      });
    } catch (error) {
      const reason = error instanceof LicenseApiError ? error.code ?? (error.retryable ? "LICENSE_API_UNAVAILABLE" : "LICENSE_API_REQUEST_FAILED") : "LICENSE_PROVISIONING_FAILED";
      await deps.saveLicenseVerification(db, organizationId, userId, recordVerification(current, {
        decision: licenseErrorDecision(reason), reasonCode: reason, organizationId,
        httpStatus: error instanceof LicenseApiError ? error.status : undefined,
        requestId: error instanceof LicenseApiError ? error.requestId : undefined
      }));
      throw error;
    }
  }

  async function sync(payload: SubscriptionStateInput & { idempotencyKey: string }) {
    const members = (await deps.listOrgMembers(db, payload.externalOrganizationId)).filter((member) => member.active);
    const principal = members.find((member) => ["admin", "owner"].includes(member.role)) ?? members[0];
    if (!principal) throw new Error("Subscription synchronization requires an active workspace member");
    // Recover independently of a terminally failed initial provision job.
    await provisionPrincipal(payload.externalOrganizationId, principal.id);
    const result = await client.synchronizeSubscriptionState(payload, payload.idempotencyKey);
    await deps.updateOrganizationLicense(db, payload.externalOrganizationId, {
      ...returnedIds(result), lastLicenseSyncAt: new Date()
    });
    for (const member of members) await deps.enqueueLicenseVerification(db, payload.externalOrganizationId, member.id);
  }

  return { provision, verify, sync };
}
