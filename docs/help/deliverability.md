# Deliverability and email tracking

## Deliverability

Open **Deliverability** to review recent email events, suppressions, and bounce/complaint hints for the workspace. Investigate configuration or provider errors before sending a campaign to a larger audience. Campaign sending uses the organization **default** Resend domain configured under **Settings → Email delivery**.

## BCC activity tracking (personal address)

1. Ask a company admin to connect a **verified** Resend domain and set it as the default (see **Settings → Email delivery**).
2. Open **Settings** and copy your **personal BCC tracking address** (`log_…@your-domain`).
3. When you email a customer from Gmail, Outlook, or another client, **BCC** that address.
4. Loop matches the sender or recipients to contacts and adds an **Email** activity card on the contact timeline (one card per message), with subject and **Open email** for the body.

Receiving must be enabled on the Resend domain (MX records) and an `email.received` webhook must point at the URL shown in Settings. Admins: follow the full checklist in the repository guide [`docs/operations/RESEND_EMAIL_SETUP.md`](../operations/RESEND_EMAIL_SETUP.md).

### Admin webhook checklist (summary)

- Copy the **exact** webhook URL from Settings (includes `?domain=…`). Example shape: `https://loop.us.twiniti.ai/api/v1/webhooks/resend?domain=your-domain`.
- In Resend, create a webhook on that URL subscribed to **`email.received`**.
- Save that endpoint’s signing secret (`whsec_…`) on the domain in Settings.
- Do **not** point Resend at the Loop homepage (`loop.twiniti.ai` / `loop-dev.twiniti.ai` without the regional webhook path).
- A mismatched URL or secret returns **HTTP 401** and BCC activity never appears.

After saving, send a test BCC and confirm a new **Email** card appears.

### Imported marketing vs BCC email

HubSpot (or other) **Imported marketing** summaries on the contact timeline show historical marketing stats only. They are not openable BCC emails. Real BCC-tracked messages appear as **Email** cards with subject and **Open email**.
