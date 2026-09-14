# Settings and team access

Open **Settings** to view the current company, your role, and workspace members.

Company admins can invite a member by email and choose **Member** or **Company Admin**. Admins can also change an existing member's role. Give admin access only to people who need to manage team access, billing, or workspace configuration.

Use the personal BCC address in Settings for email activity tracking. The address is personal to the signed-in user; do not share it as a general team address.

Company admins connect verified Resend domains under **Email delivery**. Copy the full webhook URL shown for each domain into the Resend dashboard (`/api/v1/webhooks/resend?domain=…` on the regional Loop host). Do not use the Loop homepage URL as the webhook endpoint. Save the matching Resend signing secret on the domain so inbound events can be verified.

