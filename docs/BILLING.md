# Organization billing

Twiniti Loop bills one Stripe subscription per organization (company or personal workspace). Checkout uses quantity `1` on the Price for that workspace kind; users are not metered individually.

## Required API environment

### Loop Dev operations receipt (revision 0.10.55.7, 5 November 2026)

George authorized `WEB_ORIGIN=https://twiniti-crm-dev-us.onrender.com` on
Dev US service `srv-d9potpr9ik0c73cd5a6g` in Twiniti Workspace (TWI-1044).
The service-level setting was saved and triggered deploy
`dep-dbm7tqdbedkc73bgdj30`, using Development commit
`53e06b7a57d604990edafe0919f1614846f0048f`.
Render reported the deployment live; the direct US `/health` returned HTTP
200 with `status: ok`, `regionCode: us`, and `authMode: hexclave`.
The canonical-host defaults in `render.yaml` describe a differently named
service; do not overwrite this explicit service override during reconciliation.
No Production, EU, UK, or shared environment-group values were changed.

For Dev testing, sign up and return to Billing on the direct US host above.
Existing Stripe Checkout sessions retain their original return URLs; use a
newly created session for return-flow verification. A successful deployment
alone does not prove that the authenticated checkout return works.

TWI-1041 remains pending: keep `/api/v1/webhooks/stripe` unchanged and add
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`customer.subscription.trial_will_end`, `customer.subscription.paused`,
`invoice.paid`, and `invoice.payment_failed` to the sandbox endpoint,
preserving other enabled events. Dashboard access was unavailable during
this change. Trial-ending and paused event handling is tracked in TWI-1043.

TWI-1048 configuration is approved only when its resolver PR is ready:
`STRIPE_PERSONAL_PRODUCT_ID=prod_VZHFTI67L1MAXG` and
`STRIPE_ORG_PRODUCT_ID=prod_VZHIU3nMtv82nB`, on Dev US only.
No resolver PR was open at this receipt; these variables were not set.
Keep existing Price IDs until the compatible resolver has merged.

### Current required keys

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID` (company / organization monthly Price)
- `STRIPE_PERSONAL_PRICE_ID` (personal monthly Price)
- `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` (optional)

In production, the API refuses to start without the Stripe secret, webhook secret, both Price IDs, and Hexclave server authentication.

### Plan selection and trials (revision 0.10.55.5, TWI-1047)

- Personal selects only `STRIPE_PERSONAL_PRICE_ID` (USD $9/month); Organization
  selects only `STRIPE_PRICE_ID` (USD $29/month). Missing Personal configuration
  fails instead of falling back to the Organization price.
- Both new workspaces receive seven free days with `payment_method_collection=if_required`.
  No card is needed to start. Do not add a $0 line item or catalog Trial Offer.
- The seven-day signup contract is fixed in `checkoutTerms`, independent of the
  legacy `STRIPE_TRIAL_PERIOD_DAYS` setting. The org-member discount setting remains
  readable for compatibility but is not used for new sessions. Existing subscriptions
  keep their price; this change does not migrate them.
- During the trial, open Billing and select Add payment method / manage billing.
  Enable payment-method updates in the Stripe customer portal. Without a payment
  method at trial end, Stripe cancels the subscription and workspace access locks.
  CRM data is retained. Restarting requires payment and gives no second workspace trial.
- Previous-policy open sessions are expired and replaced on the next checkout request.
  Completed subscriptions are unchanged.

### Agent and operator validation

Run billing tests, API/web typechecks, web build and repository policy checks.
After Development deployment, verify both Price IDs resolve to the USD monthly
amounts above in the correct Stripe environment. Test both plans without a card,
trialing webhook activation, portal payment-method updates, and test-clock trial
expiry with and without a card. Record regional deployment and smoke receipts in
Linear before Production promotion. DB: none. Rollback: revert TWI-1047; already
created Stripe subscriptions retain their terms.

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

1. Hexclave creates the user account and the user verifies their email.
2. The API creates the organization and makes that user its `admin`.
3. The API creates a pending billing record and a Stripe Checkout Session.
4. The user completes Checkout without a card for the seven-day trial.
5. Stripe webhook events activate the organization.
6. Access unlocks when billing is trialing or active and licensing allows access.

## Trial recovery (revision 0.10.55.6, TWI-1049)

If checkout returns but access is not ready, use **Refresh billing status**. Do
not start a second paid checkout during a trial. Billing verifies the stored
Checkout session and subscription against Stripe before allowing a replacement.
A completed session is recovered even when its webhook never arrived. Stripe
lookup failures or mismatched workspace metadata block replacement. Existing
active, trialing, incomplete, past-due, unpaid or paused subscriptions cannot be
replaced through checkout; use **Manage existing subscription**. Cancellation
also cannot start a paid replacement before the recorded trial end.

`GET /api/v1/billing` reconciles unresolved local records and returns
`checkoutAllowed`. The frontend enables checkout only after a successful billing
load explicitly allows it. Reconciliation updates local subscription state and
queues licensing sync; the regular webhook remains required for renewals and
cancellations. TWI-1041's webhook endpoint configuration remains an operator
follow-up; this recovery path does not fix a misconfigured Stripe webhook.

After deploying, re-smoke the TWI-1049 account: billing shows the existing trial,
no second session is created, and access unlocks when licensing confirms it.
Also test missing webhooks, Stripe unavailability, terminal subscription restart,
and a completed session whose subscription has not yet been recorded locally.
