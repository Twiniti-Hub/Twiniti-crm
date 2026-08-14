# Promotion handoff (PR #57, 0.10.49)

Do not merge promotion PR #57 from the GitHub UI as George-Twiniti until
`require_last_push_approval` is satisfied.

## Sequence

1. Merge reconciliation PR (production tip into `development`).
2. George **Approve** bot tip PR; **bot merges** tip (bot becomes last pusher).
3. George **Approve** promotion PR #57.
4. Bot merges PR #57.

## Release

- SHA target: `abca7de` lineage after reconciliation merge
- Version: 0.10.49 (TWI-336, TWI-337)
- DB: no new migration
