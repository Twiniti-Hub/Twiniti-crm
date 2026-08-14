# Organization Resend domains

Resend delivery is strictly organization-scoped. Each organization can register multiple verified domains, and each domain stores its own encrypted Resend API credential and sender identity. One active verified domain may be selected as the default.

API and worker email operations require an organization context and resolve either the requested domain or the organization default. There is no global Resend fallback. Credentials are encrypted at rest with `RESEND_CREDENTIAL_ENCRYPTION_KEY` and are never returned to clients, written to job payloads, or logged.

Organization administrators manage domains from Settings. A domain cannot be removed while it is the active default; another verified domain must be selected first.

Personal BCC email tracking addresses use the organization's default verified Resend domain (`log_{token}@{domain}`). Tracking addresses are created only after a verified default domain exists. Received-mail processing routes through the org's Resend receiving webhook (`/api/v1/webhooks/resend?domain={domain}`) and matches the tracking token against that organization's users.
