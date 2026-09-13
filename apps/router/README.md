# Twiniti Loop global router

This Cloudflare Worker provides the single Loop URL for each environment and routes API requests to the regional CRM services.
Marketing requests are proxied to the environment's landing site, CRM/auth requests to its canonical app origin, and API requests to the regional CRM services. A short-lived surface cookie keeps landing and app asset requests separated while both builds use `/assets/*`.

## Development setup

1. Install Wrangler and authenticate with the Twiniti Cloudflare account.
2. Create a Workers KV namespace for the development workspace directory:

```powershell
pnpm --filter @twiniti/router exec wrangler kv namespace create WORKSPACE_DIRECTORY
```

3. Replace `REPLACE_WITH_DEVELOPMENT_KV_NAMESPACE_ID` in `wrangler.toml` with the returned namespace ID.
4. Set `APP_ORIGIN` to the canonical CRM web service and add the Cloudflare route `loop-dev.twiniti.ai/*` to this Worker.
5. Deploy:

```powershell
pnpm --filter @twiniti/router deploy
```

## Production setup

Production uses a separate Worker and KV namespace so Development workspace-to-region mappings never cross the environment boundary.

- Canonical hostname: `loop.twiniti.ai`.
- Worker name: `twiniti-loop-router`.
- Binding: `WORKSPACE_DIRECTORY` → Production-only KV namespace.
- Route: `loop.twiniti.ai/*`.

Deploy the reviewed Production commit explicitly:

```powershell
pnpm --filter @twiniti/router exec wrangler deploy --env production
```

Before attaching or updating the Production route, confirm the production API, landing, and Worker origin values; then verify `/`, `/sign-in`, `/sign-up`, `/health`, and authenticated regional API traffic. Record the deployment receipt in the Production promotion's Linear issue.

The first `/api/v1/me` request discovers the user’s regional workspace and stores its workspace-to-region mapping in KV. Subsequent requests are routed using `X-Twiniti-Workspace-Id`.

The Worker contains only routing metadata. CRM records remain in their regional databases. The landing page links to same-origin `/sign-in` and `/sign-up`; country selection remains in the app onboarding flow.
