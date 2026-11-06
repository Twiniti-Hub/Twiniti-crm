import type { SubscriptionStateInput } from "./index.js";

export function buildSubscriptionState(
  billing: {
    organizationId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    trialKind: string;
    trialStart: Date | null;
    trialEnd: Date | null;
    stripePromotionCodeId: string | null;
    stripeCouponId: string | null;
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
    trialKind: billing.trialKind as SubscriptionStateInput["trialKind"],
    trialStart: billing.trialStart?.toISOString() ?? null,
    trialEnd: billing.trialEnd?.toISOString() ?? null,
    stripePromotionCodeId: billing.stripePromotionCodeId,
    stripeCouponId: billing.stripeCouponId,
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
