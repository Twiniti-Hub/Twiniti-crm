# End-to-end testing

Twiniti CRM uses Playwright for browser-level regression coverage. The suite exercises the deployed web application through the same routes and controls a user sees. It does not store credentials in the repository.

## Local execution

```text
pnpm install
pnpm e2e:install
```

Start the API and web application using the normal development workflow, then run:

```powershell
$env:E2E_BASE_URL = "http://127.0.0.1:5173"
$env:E2E_EMAIL = "test-admin@example.test"
$env:E2E_PASSWORD = "use-a-test-only-password"
pnpm e2e
```

Use a dedicated test organization. A trialing or active billing state is required for contact creation; route checks remain useful for accounts intentionally billing-gated. The suite retains a trace, screenshot, and video on failures.

## Coverage

- Hexclave login and session/bootstrap validation.
- Onboarding and billing-gate detection.
- Authenticated route smoke coverage for overview, contacts, companies, segments, campaigns, forms, workflows, agents, deliverability, settings, billing, and help.
- Contact creation with unique test data and verification in the contacts table.

CI can run the suite with `E2E_BASE_URL`, `E2E_EMAIL`, and `E2E_PASSWORD` supplied as protected environment secrets.
