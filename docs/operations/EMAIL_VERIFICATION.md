# Email verification and checkout

Revision: **0.10.55.4** · Linear: **TWI-1035** · Application base: **0.10.55**

## User guide

1. Create an account with your personal or company workspace details.
2. Open the verification email and select **Verify** on the linked page.
3. Return to the original Loop tab and select **I’ve verified my email — continue**.
4. Review the saved workspace details, create the workspace, and continue to secure checkout.

If the email has not arrived, check spam and use **Resend verification email**.
For an expired or invalid link, return to the original tab and request a fresh
email. Sign out if you registered with the wrong address. Existing accounts
should sign in rather than register again.

Workspace type, name and country are retained in the original tab for the same
email address; passwords and tokens are never stored in the draft. If you close
that tab or continue in another browser, enter the workspace details again.
Verification alone does not create a workspace or charge a payment method.

## Code contract

`AuthGate` renders `/handler/*` before login, `/me` loading/error, verification,
setup and billing screens. This allows signed-in and signed-out verification and
password-reset callbacks to run. The Hexclave SDK validates the verification
code and refreshes its user cache; the application never marks an email verified.

The client explicitly configures `/handler/email-verification` on the current
Loop origin. `VerifyEmailPage` resends through the primary contact channel and
checks `/api/v1/me` before reloading the current route. An unverified `/me`
response displays verification instructions before provisioning. Signup also
checks the SDK user before calling organization creation. Server-side
`assertVerifiedPrimaryEmail` remains authoritative.

`signupDraft` uses session storage and matches the signed-in primary email before
restoring form fields. Clear it only after successful organization creation.
No database, regional routing, billing API, or authorization policy changes.

## Agent and operator checks

- Preserve callback precedence even when a session needs setup or has inactive billing.
- Keep canonical Development/Production Loop origins allowed in the corresponding
  Hexclave project's callback configuration. Never copy credentials between environments.
- Run the web tests/typecheck/build and API email-verification-gate tests.
- After Development deployment, verify real email delivery, link redemption while
  signed in and signed out, expired-link recovery, and checkout with a test account.
  Confirm the selected country/workspace type survives in the original tab.
- Record deploy and smoke evidence in Linear before declaring the user journey fixed
  in the environment. Production follows the normal promotion policy.
- Roll back by reverting the TWI-1035 change; no schema rollback is needed.

## Session recovery (revision 0.10.55.6, TWI-1050 / TWI-1051)

Sign out remains available on bootstrap, loading, error, setup, and billing screens.
`/logout`, `/sign-out`, `/signout`, and `/handler/sign-out` open the independent
logout screen without waiting for `/health`, `useUser`, or workspace discovery.
It clears saved workspace context and calls Hexclave sign-out. If the auth service
cannot respond, it displays a retry control rather than claiming sign-out succeeded.
Use **Retry loading workspace** after transient service failures.

Regional discovery probes US/EU/UK concurrently with an eight-second request
limit and preserves region preference when multiple cells return a membership.
A reachable membership wins over an unavailable unrelated cell. With no found
membership and a failed cell, return a recoverable 503 rather than incorrectly
sending the user to create another workspace. A missing KV mapping is rediscovered
for `/me`. Browser `/me` calls abort after 15 seconds and do not overlap while polling.

Read-only investigation on 4 November 2026: canonical and US hostnames served
identical frontend bundles. US/EU unauthenticated `/me` returned promptly, while
UK and canonical requests timed out. Render UK request logs showed 503s and later
healthy responses; the UK service is on a free plan. No DNS, environment, Render
plan, or webhook changes were made. Deployment must include the router as well as
APIs/web. Verify authenticated discovery and sign-out on the canonical hostname
and direct regional host. Session cookies remain hostname-specific.
