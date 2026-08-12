# Security Policy

## Reporting a vulnerability

Please do not report security vulnerabilities in public issues. Contact the project maintainers privately through the Twiniti-Hub organization and include:

- affected component or endpoint
- reproduction steps
- potential impact
- suggested mitigation, if known

Do not include real customer records, API keys, session tokens, or other secrets in reports.

## Security principles

- Secrets belong in environment variables or a managed secret store.
- Agents must use scoped identities and the public API (or MCP); they must not connect directly to Neon.
- Contact writes and email sends must be auditable and idempotent.
- Consent and suppression rules must be enforced server-side.
- Database migrations live in `packages/db/drizzle`, are checked by
  `pnpm policy:db-chain`, and are applied region-by-region only through the
  protected migration workflow described in
  [docs/DATABASE_CHANGE_POLICY.md](docs/DATABASE_CHANGE_POLICY.md).
- Pull requests and production promotion are enforced by the repository
  policies in [docs/RELEASE_POLICY.md](docs/RELEASE_POLICY.md); security scan
  failures block the workflow.
- Production hardening and abuse-test expectations are documented in [docs/HARDENING.md](docs/HARDENING.md).
