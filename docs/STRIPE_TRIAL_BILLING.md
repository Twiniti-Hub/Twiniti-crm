# Stripe-gated trials

Twiniti CRM creates the organization and pending License_API record before sending a new Company Admin to Stripe Checkout. Creating those records does not authorize CRM access.

Stripe is authoritative for subscription state. The CRM allows access only when Stripe reports `trialing` or `active` and License_API returns `decision=allow`. Missing billing state, pending checkout, failed payment, expired trial, and unavailable licensing state fail closed.

The default trial is seven days. Customer-entered Stripe promotion codes may provide a three-month trial. License_API records the trial as `seven_day` or `three_month`, preserves the Stripe subscription identity, and changes the existing license to full/active after the first successful paid transition. No duplicate license is created.

After Checkout returns, the billing page polls briefly for the signed webhook synchronization. Polling is only a user-experience improvement; it never grants access. If confirmation does not arrive, the user remains on the billing recovery page.

Operational checks should reconcile CRM `organization_billing`, Stripe subscription events, and License_API license state. Investigate organizations remaining in `pending`, webhook failures, synchronization failures, and trial expirations without a paid subscription.
