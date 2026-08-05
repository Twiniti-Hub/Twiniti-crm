# Stripe-gated trials

Twiniti CRM creates the organization and pending License_API record before sending a new Company Admin to Stripe Checkout. Creating those records does not authorize CRM access.

Stripe is authoritative for subscription state. The CRM allows access only when Stripe reports `trialing` or `active` and License_API returns `decision=allow`. Missing billing state, pending checkout, failed payment, expired trial, and unavailable licensing state fail closed.

The default trial is seven days. Customer-entered Stripe promotion codes may provide a three-month trial. License_API records the trial as `seven_day` or `three_month`, preserves the Stripe subscription identity, and changes the existing license to full/active after the first successful paid transition. No duplicate license is created.

After Checkout returns, the billing page polls briefly for the signed webhook synchronization. Polling is only a user-experience improvement; it never grants access. If confirmation does not arrive, the user remains on the billing recovery page.

Operational checks should reconcile CRM `organization_billing`, Stripe subscription events, and License_API license state. Investigate organizations remaining in `pending`, webhook failures, synchronization failures, and trial expirations without a paid subscription.

## Production recovery runbook

If authenticated `/api/v1/me`, billing, or report requests return HTTP 500 immediately after a billing release, check for schema drift before changing an account's billing state. The API selects the complete `organization_billing` record, so a missing additive column can fail unrelated authenticated endpoints.

1. Confirm the API health endpoint for the affected region returns `200`.
2. Check `information_schema.columns` for the billing-trial fields: `stripe_subscription_status`, `trial_kind`, `trial_start`, `trial_end`, `stripe_promotion_code_id`, `stripe_coupon_id`, and `trial_converted_at`.
3. Apply `packages/db/drizzle/0008_billing_trials.sql` to each regional production CRM database. The migration is additive and idempotent; do not manually set a user's billing state as a substitute.
4. Re-query the user's organization, `organization_billing`, and license fields. A valid account should show Stripe `active` or `trialing` plus License_API `allow`.
5. Ask the user to sign out/in or hard-refresh after the API is healthy.

The browser message `Permissions policy violation: unload is not allowed in this document` is unrelated to CRM authorization and does not explain the API 500s. Treat the HTTP response and API logs as the source of truth.
