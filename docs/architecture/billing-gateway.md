# Global billing gateway

Stripe sends billing events to one global public endpoint:

`/api/v1/webhooks/stripe`

The `@twiniti/billing-gateway` service verifies the Stripe signature, reads the `regionCode` metadata on Checkout and Subscription events, and forwards the original signed payload to the matching regional CRM API. Events without region metadata are forwarded to all regions; each regional API applies its existing Stripe event-idempotency and organization billing lookup before changing state.

Development and production use separate gateway services and separate Stripe credentials. The gateway refuses to start in development when given a live (`sk_live_`) secret.

## Render configuration

- Development gateway: `twiniti-billing-gateway-dev`
- Production gateway: `twiniti-billing-gateway-prod`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are environment secrets.
- `REGIONAL_WEBHOOK_URL_US`, `REGIONAL_WEBHOOK_URL_EU`, and `REGIONAL_WEBHOOK_URL_UK` point to the regional CRM webhook routes.

The Stripe Dashboard should contain one Test-mode endpoint for development and one Live-mode endpoint for production. Regional CRM services must share the corresponding gateway webhook signing secret so they can verify the forwarded raw signature.
