## Change summary

- Linear issue:
- User or operational impact:

## Required evidence

- [ ] This PR targets `development` unless it is an approved production promotion.
- [ ] `pnpm policy:check` passes.
- [ ] `pnpm policy:db-chain` passes when database files are changed.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.
- [ ] `pnpm build` passes.
- [ ] Security impact and required checks are documented.
- [ ] Database migration impact, compatibility, rollout order, and rollback/forward-fix plan are documented, or this change has no database impact.
- [ ] Deployment verification and rollback evidence are documented for production changes.
- [ ] User, agent, code, and operational documentation are updated for a major or minor change.
- [ ] `CHANGELOG.md` is updated when the change affects a release or operational contract.

## Database change classification

- [ ] None
- [ ] Additive
- [ ] Backfill/data-changing
- [ ] Destructive
- [ ] Requires expand/contract rollout

## Validation notes

<!-- Include exact commands, environments, commit SHAs, and links to evidence. Never include secrets. -->
