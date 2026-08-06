# Organization billing

Twiniti Loop bills one Stripe subscription per organization. Checkout always uses a single configured Stripe Price with quantity `1`; users are not metered or charged individually.

## Required API environment

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` (optional)

In production, the API refuses to start without the first three values and without Hexclave server authentication.

## Stripe webhook

Configure Stripe to send these events to the global billing gateway at `/api/v1/webhooks/stripe`. The current development Render gateway URL is `https://twiniti-billing-gateway-qx9x.onrender.com`; production must use its separate gateway URL.

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The API verifies the Stripe signature against the raw request body, records event IDs for idempotency, and activates or locks the organization from subscription state. Apply migration `0004_organization_billing.sql` before enabling self-serve registration.

## Registration flow

1. Hexclave creates the user account.
2. The API creates the organization and makes that user its `admin`.
3. The API creates a pending billing record and a Stripe Checkout Session.
4. The user completes Checkout.
5. Stripe webhook events activate the organization.
6. All workspace and MCP data routes remain blocked until billing is active.
