# Settings and team access

Open **Settings** to view the current company, your role, and workspace members.

Company admins can invite a member by email and choose **Member** or **Company Admin**. Admins can also change an existing member's role. Give admin access only to people who need to manage team access, billing, or workspace configuration.

## Personal BCC address

Use the personal BCC address under **Email tracking** for activity logging. The address is personal to the signed-in user; do not share it as a general team address. It appears only after a company admin has connected a verified **default** Resend domain.

## Email delivery (company admins)

Company admins connect verified Resend domains under **Email delivery**:

1. Add the domain, From identity, and Resend API key; set a **default** domain for campaigns and BCC.
2. Copy the full webhook URL shown for each domain into the Resend dashboard (`/api/v1/webhooks/resend?domain=…` on the **regional** Loop host). Do not use the Loop homepage URL as the webhook endpoint.
3. Subscribe the Resend webhook to **`email.received`**.
4. Save the matching Resend signing secret (`whsec_…`) on the domain so inbound events can be verified.
5. Confirm the table no longer warns that the webhook secret is missing, then send a test BCC.

Full operator checklist: [`docs/operations/RESEND_EMAIL_SETUP.md`](../operations/RESEND_EMAIL_SETUP.md).
