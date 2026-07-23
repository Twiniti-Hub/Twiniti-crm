# Contributing to Twiniti CRM

Thanks for helping build Twiniti CRM.

## Development

1. Copy `.env.example` to `.env` and fill only local development values.
2. Run `pnpm install`.
3. Run `pnpm check` before opening a pull request.
4. Run `pnpm build` before submitting changes that affect the web or API packages.

Keep changes focused, add tests for behavior changes, and never commit credentials, customer data, or production exports.

## Pull requests

Pull requests should explain the user impact, include validation steps, and call out schema or migration changes. Database changes must be backward-compatible with the deployed application during rollout.
