import type { LicenseCheck } from "./index.js";

export const LICENSE_REFRESH_MS = 5 * 60_000;
export const LICENSE_OUTAGE_GRACE_MS = 24 * 60 * 60_000;
export type LicenseVerification = {
  check: LicenseCheck | null;
  checkedAt: string | null;
  lastAttemptAt: string;
  failureReason: string | null;
  failureRequestId?: string;
  failureHttpStatus?: number;
};
export type LicenseWarning = { reason: string; graceUntil: string | null; accessContinues: boolean };
type Billing = {
  status: string;
  stripeSubscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  licenseDecision?: string | null;
  licenseReasonCode?: string | null;
};

export function recordVerification(previous: LicenseVerification | null, check: LicenseCheck, now = Date.now()): LicenseVerification {
  const recoverable = check.decision === "retry" || check.reasonCode === "LICENSE_OR_USER_NOT_FOUND";
  return {
    check: recoverable ? previous?.check ?? null : check,
    checkedAt: recoverable ? previous?.checkedAt ?? null : new Date(now).toISOString(),
    lastAttemptAt: new Date(now).toISOString(),
    failureReason: recoverable ? check.reasonCode : null,
    failureRequestId: recoverable ? check.requestId : undefined,
    failureHttpStatus: recoverable ? check.httpStatus : undefined
  };
}

export function localEntitlement(billing: Billing | null, verification: LicenseVerification | null, now = Date.now()) {
  const check = verification?.check ?? null;
  const result = (billingStatus: string, warning: LicenseWarning | null = null) => ({ billingStatus, check, warning });
  if (!billing || !["active", "trialing"].includes(billing.status)) return result(billing?.status ?? "pending");
  // Existing organization denials must survive rollout until this member is checked.
  if (!check && billing.licenseReasonCode !== "LICENSE_OR_USER_NOT_FOUND") {
    if (billing.licenseDecision === "deny") return result("license_denied");
    if (billing.licenseDecision === "restricted") return result("restricted");
  }
  if (check?.decision === "deny" || check?.decision === "restricted") {
    return result(check.decision === "deny" ? "license_denied" : "restricted");
  }
  if (check?.expiresAt && Date.parse(check.expiresAt) <= now) return result("license_denied");
  if (["expired", "revoked", "suspended"].includes(check?.licenseStatus ?? "")) return result("license_denied");
  const periodEnd = billing.status === "trialing" ? billing.trialEnd : billing.currentPeriodEnd;
  if (periodEnd && periodEnd.getTime() <= now) return result("expired");
  const checkedAt = Date.parse(verification?.checkedAt ?? "");
  const confirmedTrial = billing.status === "trialing" && billing.stripeSubscriptionStatus === "trialing"
    && billing.stripeSubscriptionId && billing.trialStart && billing.trialEnd;
  const base = check?.decision === "allow" ? checkedAt : confirmedTrial ? billing.trialStart!.getTime() : NaN;
  const deadline = Math.min(base + LICENSE_OUTAGE_GRACE_MS, periodEnd?.getTime() ?? Infinity,
    check?.expiresAt ? Date.parse(check.expiresAt) : Infinity);
  const allowed = Number.isFinite(deadline) && now < deadline;
  const fresh = check?.decision === "allow" && now - checkedAt < LICENSE_REFRESH_MS && !verification?.failureReason;
  if (fresh && allowed) return result(billing.status);
  return result(allowed ? billing.status : "license_unavailable", {
    reason: verification?.failureReason ?? "LICENSE_VERIFICATION_PENDING",
    graceUntil: Number.isFinite(deadline) ? new Date(deadline).toISOString() : null,
    accessContinues: allowed
  });
}
