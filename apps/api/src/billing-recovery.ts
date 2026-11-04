export type RecoverySubscription = {
  id: string;
  status: string;
  trial_end?: number | null;
  metadata: { [key: string]: string };
};

type RecoverySession = {
  status: string | null;
  subscription: string | { id: string } | null;
  metadata: { [key: string]: string } | null;
  client_reference_id: string | null;
};

export function billingConfirmationError(message = "Your subscription is still being confirmed. Refresh billing; do not start another checkout.") {
  return Object.assign(new Error(message), { statusCode: 409, errorCode: "billing_confirmation_pending" });
}

/** Only a confirmed terminal subscription, outside its trial, may be replaced. */
export function mayReplaceSubscription(subscription: RecoverySubscription, now = Date.now()): boolean {
  return ["canceled", "incomplete_expired"].includes(subscription.status)
    && !(subscription.trial_end && subscription.trial_end * 1000 > now);
}

/** Read Stripe before offering another session, including when all webhooks were missed. */
export async function recoverCheckoutSubscription<T extends RecoverySubscription>(
  billing: { organizationId: string; stripeSubscriptionId: string | null; stripeCheckoutSessionId: string | null },
  provider: { session: (id: string) => Promise<RecoverySession>; subscription: (id: string) => Promise<T> }
): Promise<T | null> {
  let subscriptionId = billing.stripeSubscriptionId;
  if (billing.stripeCheckoutSessionId) {
    // Failure to read a known session must fail closed, not create a competing subscription.
    const session = await provider.session(billing.stripeCheckoutSessionId);
    const owner = session.metadata?.organizationId ?? session.client_reference_id;
    if (owner !== billing.organizationId) throw billingConfirmationError("Checkout workspace could not be verified.");
    if (session.status === "complete") {
      subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      if (!subscriptionId) throw billingConfirmationError();
    }
  }
  if (!subscriptionId) return null;
  const subscription = await provider.subscription(subscriptionId);
  if (subscription.metadata.organizationId !== billing.organizationId) {
    throw billingConfirmationError("Subscription workspace could not be verified.");
  }
  return subscription;
}
