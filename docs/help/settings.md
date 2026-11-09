# Settings and team access

Open **Settings** to view the current workspace (company or personal), your role, and members.

Company admins can invite a member by email and choose **Member** or **Company Admin**. Admins can also change an existing member's role. Give admin access only to people who need to manage team access, billing, or workspace configuration.

**Personal workspaces** are solo: invites and role changes are hidden. Company members never see personal workspace data.

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

## WV App Web Visitors (company admins)

Use **Settings → WV App → Web Visitors** to connect the website visitor feed for the current organization:

**Install on your website** is always available to organization administrators. Email and invitation setup do not control access to it. The Org Admin provisions the website key in organization settings; the installation card displays that saved key read-only.

Provision the organization's website key once under organization settings, enable ingestion, and save. Record creation preferences remain in those settings. To replace a website key later, use the separate **Replace website key** action.

Open the installation card for this four-step flow:

1. **Generate webhook**: generate and save the URL, or copy the saved URL. It remains available after reload. Configure your sender to deliver visitor payloads to it.
2. **Install on website**: the saved website key is populated automatically and cannot be edited here.
3. **Your generated code**: copy the ready-to-use code into the global page template after consent controls, before `</body>` or in your site's script-managed head. No key or secret needs to be inserted manually.
4. **Validate website**: publish, clear site caches, enter a public page URL, and validate. Return to re-test at any time.

**Installation verified** means the published HTML contains this organization's exact loader URL. The test does not execute JavaScript or create a test visitor. A missing result usually means the site was not published, a cache still serves the old page, the code was installed on a different template, or a tag manager injects it only at runtime. The validator accepts public HTTP(S) pages only; local, private-network, credentialed, non-HTML, oversized, and slow pages are rejected safely.

Rotate the webhook if its URL is exposed. Confirming rotation saves and displays the replacement immediately; update your sender with that URL. The website key and installation code stay unchanged. Earlier hash-only webhooks need one explicit rotation before Loop can redisplay them; they remain valid until you choose to rotate. Existing visits are retained.

Revision 0.10.55.13: installation validation supports the code copied from this card. If a request is rate limited, wait a minute before retrying. If an administrator reassigns a visitor, both the previous and new record's visit summaries are recalculated. Operators reviewing older logs should coordinate any necessary webhook-token rotation with the sender to avoid interrupted delivery.

Loop can use a WV App-supplied LinkedIn person URL as an exact professional-profile identifier. It does not scrape LinkedIn, use LinkedIn cookies, or infer a person from name, title, or employer similarity. Conflicting email and professional-profile matches are held for admin review rather than attached automatically.
