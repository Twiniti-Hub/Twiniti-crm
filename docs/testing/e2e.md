# End-to-end testing

Twiniti CRM uses Playwright for browser-level regression coverage. The suite exercises the deployed web application through the same routes and controls a user sees. It does not store credentials in the repository.

## Local execution

```text
pnpm install
pnpm e2e:install
```

Start the API and web application using the normal development workflow, then run:

```powershell
$env:E2E_LANDING_URL = "https://twiniti-crm-dev-landing.onrender.com"
$env:E2E_BASE_URL = "https://twiniti-crm-dev-us.onrender.com"
$env:E2E_EMAIL = "test-admin@example.test"
$env:E2E_PASSWORD = "use-a-test-only-password"
pnpm e2e
```

Use a dedicated test organization. A trialing or active billing state is required for contact creation; route checks remain useful for accounts intentionally billing-gated. The suite retains a trace, screenshot, and video on failures.

## Coverage

- Repeatable new-user signup with a generated unique email/password on every run.
- Hexclave login and session/bootstrap validation for the persistent test-admin account.
- Onboarding and billing-gate detection.
- Authenticated route smoke coverage for overview, contacts, companies, segments, campaigns, forms, workflows, agents, deliverability, settings, billing, and help.
- Contact creation with unique test data and verification in the contacts table.

CI can run the suite repeatedly with `E2E_LANDING_URL`, `E2E_BASE_URL`, `E2E_EMAIL`, and `E2E_PASSWORD` supplied as persistent protected repository secrets. The landing URL is the public development entry point; the base URL is the regional CRM app used after region selection. The signup test does not require a per-run credential: it generates a unique identity in Playwright. `E2E_SIGNUP_EMAIL_DOMAIN` is optional and defaults to `example.test`.

Authenticated fixtures wait for Hexclave to leave the sign-in route and render
an authenticated workspace, onboarding, billing, or Super Admin state before a
test navigates to CRM routes. Stripe Checkout renders the selected card fields
in the hosted checkout page, so the signup journey uses their accessible names
and ignores duplicate secure-payment iframes belonging to express controls.

If the persistent authenticated test account is onboarding- or billing-gated,
route and contact tests report the unavailable scenarios as skipped. The
generated signup journey remains required and covers workspace creation,
Stripe test-mode billing, authenticated CRM access, and contact creation.
