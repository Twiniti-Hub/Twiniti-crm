# Regional data architecture

Twiniti Loop assigns each new organization to one immutable residency region:

- `eu` — EU country selection
- `uk` — United Kingdom (`GB`)
- `us` — all other country selections

The country selected during registration is stored as profile metadata. The
server derives and stores `organizations.residency_region` using the versioned
country policy. The organization region cannot be changed through the product;
moving an organization requires an explicit migration procedure.

Invited users always use the organization region. Their own country does not
move the organization or create a second regional account.

## Development database synchronization

Configure these variables in the local `.env` file:

```text
DATABASE_URL=<US database>
DATABASE_URL_EU=<EU database>
DATABASE_URL_UK=<UK database>
```

Run:

```powershell
pnpm db:migrate:regional
```

The command applies the checked-in Drizzle migration chain sequentially to all
three databases. It does not print connection strings. Do not edit regional
schemas manually or run a migration against only one cell.

Production deployments should run the same migration artifact independently
against each regional Neon project before that cell is deployed. A migration
must be backward-compatible with the currently deployed application so cells
can be upgraded one at a time.

Each API and worker instance uses `REGION_CODE` to select its cell database.
`eu` and `uk` may both run in Render Frankfurt while using different database
URLs; `uk` is a logical residency cell, not a claim that Render provides a UK
region. When a cell-specific URL is absent, the service falls back to
`DATABASE_URL`, which keeps a single-cell deployment compatible.

## Current implementation boundary

This change establishes the immutable country and organization-region data
contract and regional migration workflow. The next runtime slice will add the
global routing registry, regional login handoff, wrong-region rejection, and
per-cell API/worker database selection.
