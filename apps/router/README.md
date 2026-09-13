# Twiniti Loop global router

This Cloudflare Worker provides the single Development URL for Loop and routes API requests to the regional CRM services.
Non-API requests are proxied to the Development landing site, so the same hostname can serve both the web application and its API.

## Development setup

1. Install Wrangler and authenticate with the Twiniti Cloudflare account.
2. Create a Workers KV namespace for the development workspace directory:

```powershell
pnpm --filter @twiniti/router exec wrangler kv namespace create WORKSPACE_DIRECTORY
```

3. Replace `REPLACE_WITH_DEVELOPMENT_KV_NAMESPACE_ID` in `wrangler.toml` with the returned namespace ID.
4. Add the Cloudflare route `loop-dev.twiniti.ai/*` to this Worker.
5. Deploy:

```powershell
pnpm --filter @twiniti/router deploy
```

The first `/api/v1/me` request discovers the user’s regional workspace and stores its workspace-to-region mapping in KV. Subsequent requests are routed using `X-Twiniti-Workspace-Id`.

The Worker contains only routing metadata. CRM records remain in their regional databases.
