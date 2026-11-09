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

1. Enter the WV App public key used by the website loader and save it.
2. Choose whether Loop may create companies for valid unmatched domains and contacts when WV App supplies a valid business email. Loop never creates a contact from a professional-profile URL alone.
3. Enable ingestion and copy the one-time webhook URL immediately. Loop stores only the token hash, so the URL cannot be shown again.
4. Configure WV App to deliver visitor payloads to that regional Loop webhook URL.
5. Select **Install on your website** to open the installation side card, then copy the generated loader into the website's global page template. Place it after your consent controls and before `</body>`, or in the global head when your site platform manages scripts there.
6. Publish the site and clear any site or CDN cache. Enter a public page URL in the side card and select **Validate installation**.

**Installation verified** means the published HTML contains this organization's exact loader URL. The test does not execute JavaScript or create a test visitor. A missing result usually means the site was not published, a cache still serves the old page, the code was installed on a different template, or a tag manager injects it only at runtime. The validator accepts public HTTP(S) pages only; local, private-network, credentialed, non-HTML, oversized, and slow pages are rejected safely.

Rotate the webhook token if the URL is exposed. Rotation revokes the previous URL immediately. Existing visit events and identity decisions are retained for audit and reconciliation.

Loop can use a WV App-supplied LinkedIn person URL as an exact professional-profile identifier. It does not scrape LinkedIn, use LinkedIn cookies, or infer a person from name, title, or employer similarity. Conflicting email and professional-profile matches are held for admin review rather than attached automatically.
