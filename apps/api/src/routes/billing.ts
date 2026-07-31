import Stripe from "stripe";
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
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid" || status === "incomplete" || status === "paused") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "pending";
}

function subscriptionPeriodEnd(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    customer: billing.stripeCustomerId ?? undefined,
    customer_email: billing.stripeCustomerId ? undefined : input.customerEmail ?? undefined,
    client_reference_id: input.organizationId,
    metadata: { organizationId: input.organizationId },
    subscription_data: { metadata: { organizationId: input.organizationId } },
    success_url: `${env.WEB_ORIGIN.replace(/\/$/, "")}/billing?success=1`,
    cancel_url: `${env.WEB_ORIGIN.replace(/\/$/, "")}/billing?canceled=1`
  });

  await updateOrganizationBilling(db, input.organizationId, {
    status: "pending",
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
  if (!billing) return;

  if (billing.lastStripeEventCreatedAt && billing.lastStripeEventCreatedAt.getTime() > event.created * 1000) return;
  const items = subscription.items && typeof subscription.items === "object"
    ? subscription.items as { data?: Array<{ price?: { id?: string } }> }
    : {};
  const priceId = items.data?.[0]?.price?.id ?? null;
  await updateOrganizationBilling(db, billing.organizationId, {
    status: subscriptionStatus(String(subscription.status ?? "pending")),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    ...(priceId ? { stripePriceId: priceId } : {}),
    currentPeriodEnd: subscriptionPeriodEnd(subscription.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    lastStripeEventCreatedAt: new Date(event.created * 1000)
  });
}

async function applyCheckoutCompleted(db: Db, event: Stripe.Event, session: Record<string, unknown>) {
  const metadata = session.metadata && typeof session.metadata === "object"
    ? session.metadata as Record<string, unknown>
    : {};
  const organizationId = typeof metadata.organizationId === "string"
    ? metadata.organizationId
    : typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  if (!organizationId) return;
  const billing = await ensureOrganizationBilling(db, organizationId);
  if (billing.lastStripeEventCreatedAt && billing.lastStripeEventCreatedAt.getTime() > event.created * 1000) return;
  await updateOrganizationBilling(db, organizationId, {
    status: session.payment_status === "paid" ? "active" : "pending",
    stripeCustomerId: stripeObjectId(session.customer),
    stripeSubscriptionId: stripeObjectId(session.subscription),
    stripeCheckoutSessionId: stripeObjectId(session.id),
    lastStripeEventCreatedAt: new Date(event.created * 1000)
  });
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
          status: billing?.status ?? "active",
          customerId: billing?.stripeCustomerId ?? null,
          subscriptionId: billing?.stripeSubscriptionId ?? null,
          currentPeriodEnd: billing?.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: billing?.cancelAtPeriodEnd ?? false
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

    switch (event.type) {
      case "checkout.session.completed":
        await applyCheckoutCompleted(db, event, object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscriptionEvent(db, event, object);
        break;
      case "invoice.paid":
        if (stripeObjectId(object.subscription)) {
          await applySubscriptionEvent(db, event, {
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
          await applySubscriptionEvent(db, event, {
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
    await markStripeEventProcessed(db, event.id);
    return { received: true };
  });
}
