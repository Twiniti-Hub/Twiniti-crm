# Database change policy

All six regional databases are one logical schema contract: Development US,
Development EU, Development UK, Production US, Production EU, and Production
UK. A migration is not complete until every target has the same checked-in
migration chain, schema objects, RLS policies, and runtime role contract.

## Rules

- The checked-in Drizzle journal and migration manifest are authoritative.
- Manual production SQL is prohibited.
- Every migration must be classified as additive, backfill/data-changing,
  destructive, or expand/contract.
- Migrations must be backward-compatible with the currently deployed
  application and worker during rollout.
- New migration files must be represented in both the Drizzle journal and the
  migration manifest with a checksum.
- The regional runner must stop on the first failure and must not continue with
  a partially migrated rollout.
- Production migration requires backup/PITR evidence, an approved change
  reference, protected credentials, and a migration receipt.

## Current reconciliation gate

The repository previously contained five SQL files outside the canonical
Drizzle journal. The billing-trial files were folded into the combined billing
and runtime-role migration; the RLS, runtime-role, and Resend migrations are
now the canonical journal entries. All files remain listed in
`packages/db/drizzle/migration-manifest.json` so the policy can detect edits.
This reconciliation is tracked in Linear as TWI-186.

## Required receipt

Record the commit SHA, migration manifest version, migration IDs and checksums,
target environment, region order, start/end timestamps, result per cell, schema
verification result, backup/PITR reference, rollback or forward-fix plan, and
operator/change reference. Never record connection strings or credentials.
