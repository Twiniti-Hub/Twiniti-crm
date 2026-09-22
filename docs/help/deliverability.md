# Deliverability and email tracking

## Deliverability

Open **Deliverability** to review the workspace email health and provider status. Investigate configuration or provider errors before sending a campaign to a larger audience.

## BCC activity tracking

Open **Settings** and copy your personal BCC tracking address after a company admin has connected a verified Resend domain. The address uses your organization's Resend domain. BCC that address on a customer email. Loop matches the sender or recipients to contacts and adds the message to the contact timeline when receiving is configured for that domain.

If the address is unavailable, connect a verified Resend domain in **Settings → Email delivery** and configure receiving (MX records plus an `email.received` webhook). Copy the **exact** webhook URL from Settings — it looks like `https://loop.us.twiniti.ai/api/v1/webhooks/resend?domain=your-domain`. Do not point Resend at the Loop homepage. Save the Resend signing secret (`whsec_…`) for **that** webhook on the domain in Settings. A mismatched secret returns HTTP 401 and BCC activity will not appear. After saving, send a test BCC and confirm a new Email card appears (not the HubSpot “Imported marketing” summary).

HubSpot import summaries on the contact timeline show historical marketing stats only — they are not openable BCC emails.

