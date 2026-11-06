# Loop production email templates

Revision **0.10.55.10**, TWI-1061. Native Hexclave React Email TSX, with subjects,
Transactional categories, exact built-in variable schemas and fictitious previews.
Hexclave generates HTML and plain text from this source. These are not Mustache
or HTML-import templates; no application dependencies are required.

## Publish in Hexclave

1. Select the **Loop Production** project and export/save the existing source.
2. Create a theme under **Emails → Email Settings → Themes** using the complete
   `loop-theme.tsx`. It has no logo because each template includes one. Use this
   theme for these transactional emails only; it has no marketing unsubscribe UI.
3. Under **Emails → Templates**, replace each matching built-in template with its
   complete TSX file. Keep the built-in event association; a new unrelated custom
   template does not replace an automatic event. Assign the Loop theme per template
   where available. Change the project default only after reviewing other emails.
4. Preview and test to an operator-controlled inbox, then publish. Confirm your
   hosted editor accepts `@hexclave/emails`; the official renderer also accepts
   the legacy `@stackframe/emails` alias. Do not guess variable names if versions differ.
5. Check the outbox and real event delivery. Repository commits do not install
   templates, configure senders or enable event delivery.

| Built-in event | File | Variables |
| --- | --- | --- |
| Email Verification | `email-verification.tsx` | `emailVerificationLink` |
| Password Reset | `password-reset.tsx` | `passwordResetLink` |
| Magic Link/OTP | `magic-link-otp.tsx` | `magicLink`, `otp` |
| Team Invitation | `team-invitation.tsx` | `teamDisplayName`, `teamInvitationLink` |
| Sign In Invitation | `sign-in-invitation.tsx` | `teamDisplayName`, `signInInvitationLink` |
| Payment Receipt | `payment-receipt.tsx` | `productName`, `quantity`, `amount`, optional `receiptLink` |
| Payment Failed | `payment-failed.tsx` | `productName`, `amount`, optional `invoiceUrl`, optional `failureReason` |
| Trial Ending Soon | `trial-ending-soon.tsx` | `productName`, `trialEndDate` |

`manifest.json` records schemas and subjects. Preserve Hexclave-generated token
links and OTPs. Never replace authentication links with static URLs. example.com
preview URLs are fictitious and must not be used as live payloads.

## Public logo

https://loop.twiniti.ai/branding/loop-logo-light.png

This is the existing `apps/landing/public/branding/loop-logo-light.png`, also
present in the web app. Verified HTTP 200, image/png on 6 November 2026. Each email
uses a React Email Section with a centered Img for the original square image at
160 × 160, with alt text. Preserve its aspect ratio and internal white space.
Inline styles and React Email components avoid scripts, web fonts and external CSS.

## Delivery ownership and billing

These customize Hexclave-owned events. Loop also sends organization invitations
through API/Resend and manages subscriptions through its direct Stripe integration.
Installing these templates does not reroute those sends or wire direct Stripe
webhooks to Hexclave. Confirm the actual sender/event path before enabling sends;
choose one owner per notification to avoid duplicate receipts. New delivery wiring
is separate from this template-only change.

Use trusted provider values for currency-formatted amount, product and localized
trial end date including timezone. $9/$29 appear only in preview fixtures; live
copy uses provider data. Send receipts only for confirmed payments. Trial copy
supports cardless signup and does not promise a charge without a payment method.
Billing links use https://loop.twiniti.ai/billing; select the correct workspace.
React escapes dynamic text; do not add raw HTML insertion. Senders must supply
trusted HTTPS action/receipt/invoice URLs, not arbitrary user-supplied URLs.

## Validation and rollback

Preview all eight with the companion theme; verify exactly one centered logo.
Check no display name, long team/product names, missing optional receipt/invoice/
failure reason, both plan types, mobile width, Gmail/Outlook and generated plain
text. Test actual auth callbacks and OTP in the target environment. Check sender
and reply-to domains, event ownership and cardless/payment-method-present trial
behavior. Do not send setup tests to customers.

Restore the saved provider template/theme source to roll back. No migration,
runtime, dependency or environment-variable changes are included. The hosted
Production editor still requires preview before publishing; source validation is
not a receipt of installation or live delivery.

## Verified upstream contract

Checked against Hexclave commit `c696b868eb400022ed881364dd7367a6f992c993`:

- [Templates and themes](https://github.com/hexclave/hexclave/blob/c696b868eb400022ed881364dd7367a6f992c993/docs-mintlify/guides/apps/emails/templates-and-themes.mdx)
- [Built-in schemas](https://github.com/hexclave/hexclave/blob/c696b868eb400022ed881364dd7367a6f992c993/packages/shared/src/helpers/emails.ts)
- [Renderer and plain text](https://github.com/hexclave/hexclave/blob/c696b868eb400022ed881364dd7367a6f992c993/apps/backend/src/lib/email-rendering.tsx)

## Hosted-editor compatibility (0.10.55.10)

George supplied the working `hexclave-verify-template-0.10.55.9-fix1.tsx` on
6 November 2026. All eight production templates follow that structure: no
`Preview` import/component and no literal table/tbody/tr/td logo wrapper.
`Section` contains `Img` directly; centered styles and public URL are retained.
`EmailTemplate.PreviewVariables` remains: it is sample data, not the rejected
React Email `Preview` component. Local React Email rendering did not expose the
hosted-editor incompatibility, so use the working file as the compatibility
baseline and still preview each event in the target Hexclave editor.

The existing Development verification source is retained under
`../development/email-verification.tsx`; its environment header differs but its
body follows the same fix. Event URLs still come from the selected project.
