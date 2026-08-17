# Global billing gateway

Stripe sends billing events to one global public endpoint:

`/api/v1/webhooks/stripe`

The `@twiniti/billing-gateway` service verifies the Stripe signature, reads the `regionCode` metadata on Checkout and Subscription events, and forwards the original signed payload to the matching regional CRM API. Events without region metadata are forwarded to all regions; each regional API applies its existing Stripe event-idempotency and organization billing lookup before changing state.

When fan-out is used, the gateway returns HTTP 200 if **any** regional destination accepts the event and logs the failed destinations. Stripe only receives HTTP 502 when every destination fails (or when a targeted single-region forward fails). That prevents cold-start timeouts on unrelated regions from blocking webhook delivery for the owning cell.

Development and production use separate gateway services and separate Stripe credentials. The gateway refuses to start in development when given a live (`sk_live_`) secret.

## Public gateway URLs

| Environment | Render service | Public URL |
| --- | --- | --- |
| Development (Stripe Test) | `twiniti-billing-gateway` / `twiniti-billing-gateway-dev` | `https://twiniti-billing-gateway-qx9x.onrender.com` |
| Production (Stripe Live) | `twiniti-billing-gateway-prod` | `https://twiniti-billing-gateway-prod.onrender.com` |

## Render configuration

- Development gateway: `twiniti-billing-gateway-dev` (Render free plan may hibernate; cold starts can delay Test-mode delivery)
- Production gateway: `twiniti-billing-gateway-prod`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are environment secrets.
- `REGIONAL_WEBHOOK_URL_US`, `REGIONAL_WEBHOOK_URL_EU`, and `REGIONAL_WEBHOOK_URL_UK` point to the regional CRM webhook routes.

The Stripe Dashboard should contain one Test-mode endpoint for development and one Live-mode endpoint for production. Regional CRM services must share the corresponding gateway webhook signing secret so they can verify the forwarded raw signature.
