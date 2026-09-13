# Twiniti Loop Help

Twiniti Loop is a shared marketing CRM workspace. Use the sidebar to move between CRM records, audiences, outbound messaging, automation, integrations, and account administration.

## Start here

1. Open the canonical Loop URL for your environment and choose **Sign in** or **Start your workspace**.
2. During signup, select the country for the workspace; Loop places the workspace in the matching data region.
3. Open **Overview** to confirm that your workspace is available.
4. Add or import your companies and contacts.
5. Create a segment, form, campaign, or workflow for that audience.
6. Review deliverability and activity before sending customer-facing email.

## Loop URLs and regional routing

- Development: `https://loop-dev.twiniti.ai`
- Production: `https://loop.twiniti.ai`

Use `/sign-in` and `/sign-up` on the canonical Loop URL. The router sends API
requests to the US, EU, or UK service for the selected workspace. The Render
landing hostname is a marketing origin only; do not use
`twiniti-crm-dev-landing.onrender.com/sign-in` as the CRM login address.

## Help pages

- [Getting started](getting-started.md)
- [Contacts and custom properties](contacts.md)
- [Companies](companies.md)
- [Importing CSV files](importing-data.md)
- [Segments](segments.md)
- [Campaigns](campaigns.md)
- [Forms](forms.md)
- [Workflows](workflows.md)
- [Agents and API access](agents.md)
- [Deliverability and email tracking](deliverability.md)
- [Settings and team access](settings.md)
- [Billing](billing.md)
- [Super Admin](super-admin.md)

## Product notes

- Data belongs to the currently selected company workspace.
- Contact imports run in the background; large files may remain in progress after you leave the page.
- Campaign sending is approval-gated. Preview and request approval before sending.
- A company admin can invite members and change their roles.

