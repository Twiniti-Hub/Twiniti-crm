# Database reconciliation record: TWI-186

Date: 2026-08-06

## Scope

Development US/EU/UK and Production US/EU/UK were reconciled without
rebuilding tables or modifying customer data.

## Findings

- Development cells had 12 migration rows; Production cells had 8.
- Several rows differed only because migrations had been recorded with CRLF
  versus LF file hashes.
- The billing-trial changes were already folded into the combined billing and
  runtime-role migration.
- Production UK was missing the nullable `organization_resend_domains.verified_at`
  column.

## Actions

- Restored the canonical journal sequence for the RLS, runtime-role, billing,
  and Resend migrations.
- Marked the duplicate billing-trial files as `retired-folded` in the manifest.
- Normalized migration hashes to LF-based canonical hashes in all six ledgers.
- Added and applied `0012_reconcile_resend_domain_verification.sql`, which adds
  the missing nullable column idempotently.
- Preserved existing migration timestamps and customer data.

## Verification

Both environments passed the regional schema verifier:

```text
Development: US/EU/UK schemaMatch=true
Production:  US/EU/UK schemaMatch=true
```

The repository migration policy now passes in strict mode:

```text
Migration chain check passed: 13 journaled entries, 0 unresolved legacy entries
```

No connection strings or credentials are recorded here.
