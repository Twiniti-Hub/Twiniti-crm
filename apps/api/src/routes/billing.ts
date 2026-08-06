import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppEnv } from "@twiniti/config";
import {
  ensureOrganizationBilling,
  findOrganizationBillingByStripeId,
  getOrganizationBilling,
  markStripeEventProcessed,
  recordStripeEvent,
  updateOrganizationBilling,
  type Db
} from "@twiniti/db";
import { audit, requireActor, requireOrgId, requireUserRole, sendError } from "../auth-hook.js";
import { buildSubscriptionState, enqueueLicenseSubscriptionSync } from "../license-jobs.js";
import type { TrialKind } from "@twiniti/license-api";

type RawBodyRequest = FastifyRequest & { rawBody?: string | Buffer };

function configuredStripe(env: AppEnv) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

function subscriptionStatus(status: string): string {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid" || status === "incomplete" || status === "paused") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "pending";
}

function subscriptionPeriodEnd(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function stripeDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function trialKind(trialStart: Date | null, trialEnd: Date | null, configuredDays: number): TrialKind {
  if (!trialStart || !trialEnd || trialEnd <= trialStart) return "none";
  const days = (trialEnd.getTime() - trialStart.getTime()) / (24 * 60 * 60 * 1000);
  if (days >= 80) return "three_month";
  if (days >= 5 && days <= 8 && configuredDays === 7) return "seven_day";
  return "unknown";
}

function stripeDiscountIds(value: unknown) {
  if (!Array.isArray(value)) return { promotionCodeId: null, couponId: null };
  const discount = value[0] && typeof value[0] === "object" ? value[0] as Record<string, unknown> : {};
  const promotionCode = stripeObjectId(discount.promotion_code);
  const coupon = stripeObjectId(discount.coupon);
  return { promotionCodeId: promotionCode, couponId: coupon };
}

export async function createOrganizationCheckoutSession(
  db: Db,
  env: AppEnv,
  input: { organizationId: string; customerEmail?: string | null }
) {
  const stripe = configuredStripe(env);
  if (!stripe) {
    const error = new Error("Stripe billing is not configured") as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  }

  const billing = await ensureOrganizationBilling(db, input.organizationId);
  if (["active", "trialing"].includes(billing.status)) return null;

  // Reuse only a still-open session. Stripe idempotency keys are durable, so
  // a fixed organization key can otherwise return an expired checkout forever.
  if (billing.stripeCheckoutSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(billing.stripeCheckoutSessionId);
      if (existing.status === "open" && existing.url) return existing;
    } catch {
      // Create a fresh session when the stored session was deleted or expired.
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    customer: billing.stripeCustomerId ?? undefined,
    customer_email: billing.stripeCustomerId ? undefined : input.customerEmail ?? undefined,
    client_reference_id: input.organizationId,
    allow_promotion_codes: true,
    metadata: { organizationId: input.organizationId },
    subscription_data: {
      metadata: { organizationId: input.organizationId },
      ...(env.STRIPE_TRIAL_PERIOD_DAYS > 0
        ? {
            trial_period_days: env.STRIPE_TRIAL_PERIOD_DAYS,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } }
          }
        : {})
    },
    success_url: `${env.WEB_ORIGIN.replace(/\/$/, "")}/billing?success=1`,
    cancel_url: `${env.WEB_ORIGIN.replace(/\/$/, "")}/billing?canceled=1`
  }, { idempotencyKey: `organization-checkout:${input.organizationId}:${randomUUID()}` });

  await updateOrganizationBilling(db, input.organizationId, {
    status: ["active", "trialing"].includes(billing.status) ? billing.status : "pending",
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: stripeObjectId(session.customer),
    stripePriceId: env.STRIPE_PRICE_ID
  });
  return session;
}

async function applySubscriptionEvent(db: Db, event: Stripe.Event, subscription: Record<string, unknown>) {
  const subscriptionId = stripeObjectId(subscription.id);
  const customerId = stripeObjectId(subscription.customer);
  const metadata = subscription.metadata && typeof subscription.metadata === "object"
    ? subscription.metadata as Record<string, unknown>
    : {};
  let billing = await findOrganizationBillingByStripeId(db, { subscriptionId, customerId });
  const organizationId = typeof metadata.organizationId === "string" ? metadata.organizationId : billing?.organizationId;
  if (!billing && organizationId) {
    await ensureOrganizationBilling(db, organizationId);
    billing = await getOrganizationBilling(db, organizationId);
  }
  if (!billing) return null;

  if (billing.lastStripeEventCreatedAt && billing.lastStripeEventCreatedAt.getTime() > event.created * 1000) return billing.organizationId;
  const items = subscription.items && typeof subscription.items === "object"
    ? subscription.items as { data?: Array<{ price?: { id?: string } }> }
    : {};
  const priceId = items.data?.[0]?.price?.id ?? null;
  const trialStart = stripeDate(subscription.trial_start);
  const trialEnd = stripeDate(subscription.trial_end);
  const nextStatus = subscriptionStatus(String(subscription.status ?? "pending"));
  const discounts = stripeDiscountIds(subscription.discounts);
  const nextTrialKind = nextStatus === "trialing" ? trialKind(trialStart, trialEnd, 7) : "none";
  const convertedAt = billing.status === "trialing" && nextStatus === "active" ? new Date(event.created * 1000) : null;
  await updateOrganizationBilling(db, billing.organizationId, {
    status: nextStatus,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: String(subscription.status ?? "pending"),
    ...(priceId ? { stripePriceId: priceId } : {}),
    ...(trialStart ? { trialStart } : {}),
    ...(trialEnd ? { trialEnd } : {}),
    trialKind: nextTrialKind,
    ...(discounts.promotionCodeId ? { stripePromotionCodeId: discounts.promotionCodeId } : {}),
    ...(discounts.couponId ? { stripeCouponId: discounts.couponId } : {}),
    ...(subscriptionPeriodEnd(subscription.current_period_end) ? { currentPeriodEnd: subscriptionPeriodEnd(subscription.current_period_end) } : {}),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    ...(convertedAt ? { trialConvertedAt: convertedAt } : {}),
    lastStripeEventCreatedAt: new Date(event.created * 1000)
  });
  return billing.organizationId;
}

async function applyCheckoutCompleted(db: Db, event: Stripe.Event, session: Record<string, unknown>) {
  const metadata = session.metadata && typeof session.metadata === "object"
    ? session.metadata as Record<string, unknown>
    : {};
  const organizationId = typeof metadata.organizationId === "string"
    ? metadata.organizationId
    : typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  if (!organizationId) return null;
  const billing = await ensureOrganizationBilling(db, organizationId);
  if (billing.lastStripeEventCreatedAt && billing.lastStripeEventCreatedAt.getTime() > event.created * 1000) return organizationId;
  const discounts = stripeDiscountIds(session.discounts);
  await updateOrganizationBilling(db, organizationId, {
    status: "pending",
    stripeCustomerId: stripeObjectId(session.customer),
    stripeSubscriptionId: stripeObjectId(session.subscription),
    stripeCheckoutSessionId: stripeObjectId(session.id),
    ...(discounts.promotionCodeId ? { stripePromotionCodeId: discounts.promotionCodeId } : {}),
    ...(discounts.couponId ? { stripeCouponId: discounts.couponId } : {}),
    lastStripeEventCreatedAt: new Date(event.created * 1000)
  });
  return organizationId;
}

export async function registerBillingRoutes(app: FastifyInstance, db: Db, env: AppEnv) {
  app.get("/api/v1/billing", async (request, reply) => {
    try {
      const actor = requireActor(request);
      const organizationId = requireOrgId(actor);
      const billing = await getOrganizationBilling(db, organizationId);
      return {
        data: {
          organizationId,
          status: billing?.status ?? "pending",
          customerId: billing?.stripeCustomerId ?? null,
          subscriptionId: billing?.stripeSubscriptionId ?? null,
          stripeSubscriptionStatus: billing?.stripeSubscriptionStatus ?? null,
          currentPeriodEnd: billing?.currentPeriodEnd?.toISOString() ?? null,
          trialKind: billing?.trialKind ?? "none",
          trialStart: billing?.trialStart?.toISOString() ?? null,
          trialEnd: billing?.trialEnd?.toISOString() ?? null,
          stripePromotionCodeId: billing?.stripePromotionCodeId ?? null,
          stripeCouponId: billing?.stripeCouponId ?? null,
          trialConvertedAt: billing?.trialConvertedAt?.toISOString() ?? null,
          cancelAtPeriodEnd: billing?.cancelAtPeriodEnd ?? false,
          licenseProvisioningStatus: billing?.licenseProvisioningStatus ?? "pending",
          licenseDecision: billing?.licenseDecision ?? null,
          licenseStatus: billing?.licenseStatus ?? null,
          licenseReasonCode: billing?.licenseReasonCode ?? null,
          licenseGraceCutoff: billing?.licenseGraceCutoff?.toISOString() ?? null
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/billing/checkout-session", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const session = await createOrganizationCheckoutSession(db, env, {
        organizationId: requireOrgId(actor),
        customerEmail: actor.email
      });
      if (!session) return { data: { status: "active", checkoutUrl: null } };
      await audit(db, actor, "billing.checkout_session.create", "organization", requireOrgId(actor), { sessionId: session.id });
      return { data: { status: "pending", checkoutUrl: session.url, sessionId: session.id } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/billing/portal", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const stripe = configuredStripe(env);
      const billing = await getOrganizationBilling(db, requireOrgId(actor));
      if (!stripe || !billing?.stripeCustomerId) {
        return reply.code(409).send({ error: { code: "billing_unavailable", message: "No Stripe customer is active for this organization" } });
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: billing.stripeCustomerId,
        return_url: `${env.WEB_ORIGIN.replace(/\/$/, "")}/settings`,
        configuration: env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID || undefined
      });
      return { data: { url: portal.url } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/webhooks/stripe", { config: { rawBody: true } }, async (request, reply) => {
    if (!env.STRIPE_WEBHOOK_SECRET) return reply.code(503).send({ error: "Stripe webhook is not configured" });
    const stripe = configuredStripe(env);
    if (!stripe) return reply.code(503).send({ error: "Stripe is not configured" });
    const signature = request.headers["stripe-signature"];
    const rawBody = (request as RawBodyRequest).rawBody;
    if (!signature || !rawBody) return reply.code(400).send({ error: "Missing Stripe webhook signature or body" });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid Stripe signature" });
    }

    const object = event.data.object as unknown as Record<string, unknown>;
    const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata as Record<string, unknown> : {};
    const organizationId = typeof metadata.organizationId === "string" ? metadata.organizationId : null;
    const firstDelivery = await recordStripeEvent(db, {
      stripeEventId: event.id,
      eventType: event.type,
      organizationId,
      payload: object
    });
    if (!firstDelivery) return { received: true, duplicate: true };

    let syncOrganizationId: string | null = organizationId;
    switch (event.type) {
      case "checkout.session.completed":
        syncOrganizationId = await applyCheckoutCompleted(db, event, object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        syncOrganizationId = await applySubscriptionEvent(db, event, object);
        break;
      case "invoice.paid":
        if (stripeObjectId(object.subscription)) {
          syncOrganizationId = await applySubscriptionEvent(db, event, {
            id: object.subscription,
            customer: object.customer,
            status: "active",
            current_period_end: null,
            metadata: {}
          });
        }
        break;
      case "invoice.payment_failed":
        if (stripeObjectId(object.subscription)) {
          syncOrganizationId = await applySubscriptionEvent(db, event, {
            id: object.subscription,
            customer: object.customer,
            status: "past_due",
            metadata: {}
          });
        }
        break;
      default:
        break;
    }
    if (syncOrganizationId) {
      const billing = await getOrganizationBilling(db, syncOrganizationId);
      if (billing) {
        await enqueueLicenseSubscriptionSync(db, env, buildSubscriptionState(billing, {
          eventId: event.id,
          eventCreatedAt: new Date(event.created * 1000),
          gracePeriodDays: env.LICENSE_API_GRACE_PERIOD_DAYS
        }));
      }
    }
    await markStripeEventProcessed(db, event.id);
    return { received: true };
  });
}
