# Contacts and Companies Kanban Views

## Summary

- Make Kanban the default at `/contacts` and `/companies`; preserve tables at `?view=list` with visible Kanban/List links.
- Target version **`0.10.37`** (repository was already past `0.10.20` when this work started).
- Persist private per-user views and administrator-managed organization views. Dragging between lanes updates the record with optimistic concurrency and audit history.
- Private-view isolation is enforced in the **API** (and optionally tighter RLS later). Org-scoped RLS alone does not hide one member's private views from another.

## Product and UI Changes

- Default Contact lanes (labels): Unassigned, Subscriber, Lead, Marketing Qualified Lead, Sales Qualified Lead, Opportunity, Customer, Evangelist, Other.
- Default Company lanes (labels): Unassigned, Prospect, Qualified, Customer, Partner, Former Customer.
  - Add `companies.lifecycle_stage`.
  - Existing companies remain Unassigned (`null`); newly created companies default to Prospect (`prospect`).
- Move creation forms behind accessible “New contact” / “New company” `<dialog>`s. Keep field management and CSV import available from the header.
- Contact cards: name, email, primary company, last update. Company cards: name, domain, industry, contact count, last update.
- Customize grouping field, up to 12 ordered/visible lanes, card fields, filters, sorting. Scalar custom properties may group with explicit values; unconfigured values fall into Other.
- Private save/copy/rename/reset/delete. Admins publish and manage shared views; members may use or copy shared views but cannot mutate them.
- Search, lane counts, lane-level load-more, horizontal scroll, empty/error states. Card order follows selected sort (not manual rank).
- Pointer + keyboard drag sensors and an explicit “Move to…” action.

## Canonical stage slugs

Stored values are HubSpot-compatible slugs (case-insensitive match). Do not rewrite existing contact rows.

| Object | Slug | Lane label |
| --- | --- | --- |
| contact | `subscriber` | Subscriber |
| contact | `lead` | Lead |
| contact | `marketingqualifiedlead` | Marketing Qualified Lead |
| contact | `salesqualifiedlead` | Sales Qualified Lead |
| contact | `opportunity` | Opportunity |
| contact | `customer` | Customer |
| contact | `evangelist` | Evangelist |
| company | `prospect` | Prospect |
| company | `qualified` | Qualified |
| company | `customer` | Customer |
| company | `partner` | Partner |
| company | `former_customer` | Former Customer |

- Unassigned: `null` or blank string.
- Other: any other non-empty value (including title-case leftovers such as `"Customer"`).

## Board card DTOs

Board endpoints return card payloads, not the bare list DTOs.

**Contact card:** `id`, display `name`, `email`, `primaryCompany` `{ id, name } | null`, `lifecycleStage`, `updatedAt`, `version`, plus selected card fields. Exclude archived and merged contacts.

**Company card:** `id`, `name`, `domain`, `industry`, `contactCount`, `lifecycleStage`, `updatedAt`, `version`, plus selected card fields. Exclude archived companies.

## Data and API Changes

- Extend `saved_views` with `presentation` (`board` | `list`), `visibility` (`private` | `shared`), `board_config` jsonb, `updated_at`, `version`.
- Add `view_preferences` keyed by `(organization_id, user_id, object_type, presentation)`.
- Validated contracts for `BoardView`, lanes, grouping field, card fields, filters, sorting, summaries, cursor pages, and move requests.
- Organization-scoped endpoints to list/create/update/delete private and shared board views; select a preferred Contact or Company board; retrieve lane counts and cursor-paginated cards; move a record to a validated lane using its current version.
- Add `PATCH /api/v1/companies/:id` with version conflicts, property history, and audit — contact parity.
- Board moves resolve the view's grouping field server-side, atomically update either the core stage or **merge one JSON property key** (never replace the whole `properties` blob), increment record version, write property history, and emit an audit event.
- Members read boards and manage private views. Only admins mutate shared views. Agents receive **no** new board-view permissions in this release.
- Additive regional migration and indexes:
  - `contacts (organization_id, lifecycle_stage, updated_at desc, id)`
  - `companies (organization_id, lifecycle_stage, updated_at desc, id)`
  - `saved_views (organization_id, object_type, visibility, created_by)`
  - unique preference `(organization_id, user_id, object_type, presentation)`

## Filters and pagination

- Board queries use real keyset cursors on `(updated_at, id)` within org + group value.
- Contact filter AST remains contact-scoped; company boards use a company field map (`lifecycle_stage`, `industry`, `name`, `domain`, `properties.*`).
- Default boards group on indexed core `lifecycle_stage`. Custom-property grouping is allowed for enum/string fields but is not the default path.

## Testing and Delivery

- Unit/integration: default lane mapping, Unassigned/Other, custom-property grouping, view validation, private/shared permissions, tenant isolation, lane counts, cursor pagination, company updates, JSON-merge moves, version conflicts, audit, migration compatibility.
- Web: default routing, List links, dialogs, optimistic rollback, empty/loading/error, keyboard Move to, focus, reduced motion, dark mode, mobile overflow.
- Playwright: both object types — default Kanban, List fallback, create via dialog (replaces the previous inline-form + `tbody` assertion), cross-lane move, refresh persistence, conflict recovery. Shared-view publish/copy covered in API tests when a second identity is unavailable in E2E.
- A 100k-contact soak is optional/out-of-band, not a merge gate. Development-scale boards (~2k contacts) plus per-lane pagination and indexes are the PR bar.
- Update architecture/API docs, agent guidance (no new board scopes), Contacts/Companies help, E2E docs, and `CHANGELOG.md` for `0.10.37`.
- Branch from `origin/development`, PR to `development`. Final reviewable push from `twiniti-code-bot`; CODEOWNER approval from George on that exact head.
- After merge: additive regional migrate Development, deploy exact SHA, verify US/EU/UK. Production only via a later `development` → `production` promotion PR.

## Assumptions

- `/contacts` and `/companies` resolve to Kanban unless `view=list` is present; choosing List does not replace the product default.
- System defaults are immutable; customization creates or updates a private view.
- Moving cards changes data but triggers no workflow automation in this release.
- Unrelated local untracked files remain untouched.
