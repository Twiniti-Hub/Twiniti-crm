# Organization billing

Twiniti Loop bills one Stripe subscription per organization. Checkout always uses a single configured Stripe Price with quantity `1`; users are not metered or charged individually.

## Required API environment

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` (optional)

In production, the API refuses to start without the first three values and without Hexclave server authentication.

## Stripe webhook

Configure Stripe to send these events to the global billing gateway at `/api/v1/webhooks/stripe`.

| Stripe mode | Gateway URL |
| --- | --- |
| Test (Development / E2E) | `https://twiniti-billing-gateway-qx9x.onrender.com/api/v1/webhooks/stripe` |
| Live (Production) | `https://twiniti-billing-gateway-prod.onrender.com/api/v1/webhooks/stripe` |

Do not point Live mode at the Development gateway, and do not point Test mode at Production. Regional CRM APIs must share the signing secret for the gateway endpoint that forwards to them.

Required events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Checkout and subscription metadata must include `organizationId` and `regionCode` (`us` | `eu` | `uk`) so the gateway can forward to one region. Events without `regionCode` fan out to all regions; the gateway acknowledges the delivery when any region accepts it.

The API verifies the Stripe signature against the raw request body, records event IDs for idempotency, and activates or locks the organization from subscription state. Apply migration `0004_organization_billing.sql` before enabling self-serve registration.

Super Admins can force a Stripe → CRM → License_API refresh with:

`POST /api/v1/super-admin/organizations/:organizationId/billing/resync`

## Registration flow

1. Hexclave creates the user account.
2. The API creates the organization and makes that user its `admin`.
3. The API creates a pending billing record and a Stripe Checkout Session.
4. The user completes Checkout.
5. Stripe webhook events activate the organization.
6. All workspace and MCP data routes remain blocked until billing is active.
