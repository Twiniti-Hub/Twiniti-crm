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
