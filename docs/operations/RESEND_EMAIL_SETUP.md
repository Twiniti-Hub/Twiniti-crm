# Resend email setup (Loop)

How Twiniti Loop uses Resend for **outbound campaigns** and **inbound BCC activity tracking**, and the exact dashboard steps required for a workspace.

Operator companion to [organization Resend domains](../architecture/organization-resend-domains.md). End-user steps live in [Deliverability help](../help/deliverability.md) and [Settings help](../help/settings.md).

## What Resend does in Loop

| Capability | Path | Requires |
| --- | --- | --- |
| Campaign / transactional send | Org Resend API key + verified **default** domain | Domain verified in Resend; credential saved in Settings |
| Personal BCC timeline logging | Resend **Receiving** (MX) + `email.received` webhook → regional API → worker | Same default domain; webhook URL + signing secret; MX for receiving |
| Platform ops mail (signup alerts, etc.) | Shared `RESEND_API_KEY` / `PLATFORM_EMAIL_FROM` | Render common env — **not** org Settings |

There is no global Resend fallback for tenant mail. Each organization stores its own encrypted API key and webhook secret per domain.

## End-to-end BCC flow

1. User copies personal address from **Settings** (`log_{token}@{org-default-domain}`).
2. User BCCs that address on a customer email (Gmail, Outlook, etc.).
3. Resend receiving accepts the message (MX on the org domain).
4. Resend POSTs Svix-signed `email.received` to the regional Loop webhook.
5. API verifies the signature with the domain’s stored `whsec_…`, stores `webhook_events`, enqueues a worker job.
6. Worker fetches message content via Resend Receiving API, matches contacts, writes `email_activities` / timeline **Email** cards (one per Message-ID).

If step 4 returns **401**, the worker never runs. If the worker fails later, webhook rows exist but timeline stays empty until the job succeeds.

## Regional hosts

Users sign in on the canonical Loop hostname. Webhooks must target the **regional** API origin for the workspace (shown in Settings as the absolute webhook URL).

| Environment | Canonical app | Example regional webhook host |
| --- | --- | --- |
| Development | `https://loop-dev.twiniti.ai` | Settings **Copy URL** (preferred) |
| Production | `https://loop.twiniti.ai` | e.g. `https://loop.us.twiniti.ai` for US orgs |

Always copy the URL from **Settings → Email delivery**. Do not invent a host. Do **not** use:

- `https://loop.twiniti.ai/` or `https://loop-dev.twiniti.ai/` (homepage / marketing)
- A Render landing hostname
- A webhook URL for a different organization’s domain

Preferred path:

```text
https://{regional-loop-host}/api/v1/webhooks/resend?domain={your-domain}
```

Svix-signed POSTs to the regional origin root (`POST /`) are also accepted when the receiving domain can be inferred from the payload, but the explicit `?domain=` URL from Settings remains the supported setup.

## Admin setup checklist

### 1. Create and verify the domain in Resend

1. In [Resend](https://resend.com), add the sending/receiving domain (for example `crm.example.com`).
2. Publish the DNS records Resend shows (SPF/DKIM for sending).
3. Wait until the domain status is **Verified**.

### 2. Enable receiving (BCC tracking)

1. In Resend, enable **Receiving** for that domain.
2. Publish the **MX** records Resend requires so inbound mail to `@your-domain` is delivered to Resend.
3. Without MX, BCC addresses never reach Loop.

### 3. Connect the domain in Loop Settings

Company Admin → **Settings → Email delivery**:

1. Add the domain, From email / name, and the org’s Resend **API key**.
2. Set it as the **default** domain (BCC addresses and campaign send use the default).
3. Copy the **Webhook URL** for that row.

### 4. Create the Resend webhook

In Resend → Webhooks:

1. Endpoint URL = the **exact** URL copied from Settings (include `?domain=…`).
2. Subscribe at least to **`email.received`** (delivery events may also be useful for Deliverability).
3. Create the endpoint and copy the signing secret (`whsec_…`).

### 5. Save the signing secret in Loop

Back in Settings → Email delivery → **Edit** the domain:

1. Paste the `whsec_…` signing secret for **that** webhook.
2. Save. The table should no longer show “Webhook secret missing”.

A secret from a different Resend endpoint, or a rotated secret that was never re-saved, produces **HTTP 401 Invalid Resend webhook signature** and no BCC timeline activity.

### 6. Smoke-test

1. Ensure your user has a personal BCC address under Settings (requires verified default domain).
2. Send a real email to a contact that exists in Loop, BCC the tracking address.
3. Within a short time, open the contact: a new **Email** activity card should appear with subject and **Open email**.
4. Do not confuse HubSpot **Imported marketing** summary cards with BCC email — those are historical import stats and cannot be opened as messages.

## Platform / Render notes

- `RESEND_CREDENTIAL_ENCRYPTION_KEY` must be set on regional APIs and the worker so org API keys and webhook secrets can be decrypted.
- Platform alerts use `RESEND_API_KEY` + `PLATFORM_EMAIL_FROM` from the common env group; they do not use org domains.
- One worker processes all three regional queues for the environment; BCC ingest jobs are organization-scoped.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No BCC address in Settings | No verified **default** Resend domain | Admin connects domain, verifies, sets default |
| Resend dashboard shows 401 on webhook | Wrong URL or wrong/mismatched `whsec_…` | Copy URL from Settings; save the secret for **that** endpoint |
| Webhook 200 but no timeline card | Worker job failed or contact not matched | Check worker jobs / `webhook_events`; confirm contact email matches To/From/Cc |
| Timeline shows HubSpot import, not new mail | Looking at imported marketing summary | Send a new BCC; look for **Email** card with Open email |
| Subject/body empty on old rows | Stored before parse/dedupe fixes | New receives after current Production tip carry content |

## Related docs

- [docs/help/deliverability.md](../help/deliverability.md) — end-user BCC and deliverability
- [docs/help/settings.md](../help/settings.md) — Settings UI
- [docs/architecture/organization-resend-domains.md](../architecture/organization-resend-domains.md) — data model and tenancy
- [CHANGELOG](../../CHANGELOG.md) — webhook Svix accept at regional origin (`0.10.55`), BCC timeline fixes
