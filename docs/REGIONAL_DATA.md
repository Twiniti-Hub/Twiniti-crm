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
DEPLOYMENT_ENV=development
DATABASE_URL_Dev_US=<US development branch>
DATABASE_URL_Dev_EU=<EU development branch>
DATABASE_URL_Dev_UK=<UK development branch>
```

Run:

```powershell
pnpm db:migrate:regional
```

The command applies the checked-in Drizzle migration chain sequentially to all
three databases. For production, set `DEPLOYMENT_ENV=production` in a
protected migration job; it will use `DATABASE_URL_Prod_US`,
`DATABASE_URL_Prod_EU`, and `DATABASE_URL_Prod_UK`. It does not print
connection strings. Do not edit regional schemas manually or run a migration
against only one cell.

Production deployments should run the same migration artifact independently
against each regional Neon project before that cell is deployed. A migration
must be backward-compatible with the currently deployed application so cells
can be upgraded one at a time.

Each API instance uses `REGION_CODE` and `DEPLOYMENT_ENV` to select its cell
database. The single worker service receives all three URLs for its
environment and processes each regional queue in sequence. `eu` and `uk` may
both run in Render Frankfurt while using different database URLs; `uk` is a
logical residency cell, not a claim that Render provides a UK region.

Render runs both environments with `NODE_ENV=production` for production-grade
runtime behavior. `DEPLOYMENT_ENV` is therefore the authoritative selector for
the Dev versus Prod database contract and for readiness validation.

## Render service layout

`render.yaml` is the development Blueprint and `render.production.yaml` is the
production Blueprint. Each environment contains three API services, one static
landing service, and one worker service:

- API US: `REGION_CODE=us`
- API EU: `REGION_CODE=eu`
- API UK: `REGION_CODE=uk` in Render Frankfurt
- Landing: separate static service with environment-specific links to the CRM
  app's `/sign-up` and `/sign-in` routes; assign the public DNS name to this
  service in Render
- Worker: all three database URLs for that environment

The Blueprint files contain secret placeholders only. Populate the
`sync: false` values in Render; do not copy local `.env` values into Git. The
Render project uses one common environment group per environment and one
worker-database group per environment. Link the common group to that
environment's APIs and worker; link the worker-database group only to the
worker. Because Render does not re-prompt for existing `sync: false` values
during a Blueprint update, add newly introduced secrets manually in the
Dashboard.

## Current implementation boundary

This change establishes the immutable country and organization-region data
contract and regional migration workflow. The next runtime slice will add the
global routing registry, regional login handoff, wrong-region rejection, and
per-cell API/worker database selection.
