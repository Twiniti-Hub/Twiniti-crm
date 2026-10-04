# Personal workspace in Loop (Twiniti CRM)

**Linear:** [TWI-775](https://linear.app/twiniti/issue/TWI-775/plan-personal-loop-workspace-isolated-from-company-org)  
**Status:** Plan only (no product or schema changes in this document)  
**Goal:** A person can use Loop as a **personal CRM** in a workspace that is completely separate from any **company** organization they belong to.

## Constraints (George)

1. Personal workspace data must **not** be visible to the company organization.
2. Belonging to a company organization must **not** grant access to that person’s personal workspace.
3. This is **personal CRM**, not a second company tenant that shares the org’s records.

---

## Current model (as implemented in this repo)

### Terminology

| UI / docs term | Code / database term |
| --- | --- |
| Workspace | `organizations` row |
| Workspace member | `crm_users` row (`organization_id`, `hexclave_subject`, `role`, `active`) |
| Company signup | `POST /api/v1/organizations` → `createOrganization` |

Product copy treats “workspace” and “company” as the same thing today (`SignUpPage`: “Start your company workspace”; Settings lists **organization** members).

### Tenancy and data isolation

- **Every CRM entity is organization-scoped.** Tables carry `organization_id` (contacts, companies, mail, campaigns, agents, workflows, imports, audit, etc.). See `packages/db/src/schema.ts`.
- **API tenancy** is the authenticated actor’s `organizationId`, set in `resolveRequestActor` (`packages/auth/src/index.ts`) and enforced on routes via `requireOrgId` / `assertOrganization`.
- **PostgreSQL RLS** is a second boundary: `0008_organization_rls.sql` enables forced RLS on all tables with `organization_id`. Rows are visible only when:
  - `twiniti.organization_id` and `twiniti.hexclave_subject` are set for the request transaction, **and**
  - `twiniti_is_active_member(org_id, subject)` is true (active `crm_users` row or valid agent identity in that org).

See `docs/architecture/organization-rls.md`. Client header `X-Twiniti-Workspace-Id` is **not** trusted alone; Super Admin workspace selection still requires server-side org lookup and membership resolution.

### Authentication and “which workspace am I in?”

For normal (non–Super Admin) users, `resolveRequestActor`:

1. Resolves Hexclave subject from the session.
2. Loads **at most one** `crm_users` row via `findCrmUserBySubject` (unique index on `hexclave_subject`).
3. Sets `organizationId` to that row’s `organization_id` with no client override.

If there is no active membership, the user gets `needsSetup: true` and is guided to onboarding (`AuthGate`, `OnboardingPage`, `SignUpPage`).

**Super Admins** are the exception: they may send `X-Twiniti-Workspace-Id` (stored in browser as `twiniti.activeWorkspaceId`, see `apps/web/src/lib/api.ts`) to operate in a chosen org. Regular users cannot switch workspaces in the UI.

### Membership rules today

- **One Hexclave subject → one `crm_users` row globally** (`crm_users_subject_idx` unique on `hexclave_subject`).
- Accepting a company invite (`acceptInvitation`) **fails with 409** if the subject already has a `crm_users` row (“You already belong to a company”).
- Creating a second company via `POST /api/v1/organizations` is blocked for non–Super Admin users who already have an org (unless `needsSetup` / Super Admin paths).

So a person cannot today be an active member of **both** a company workspace and another workspace under the same login.

### Provisioning and billing

- New company workspace: country → `organizations.residency_region` (immutable per org; see `docs/REGIONAL_DATA.md`), Stripe checkout for the **organization** (`organization_billing`), License API checks keyed by `externalOrganizationId` (= org UUID).
- Invited members inherit the **organization’s region**; their personal country does not create a second regional account.

### “Personal” in the product today

The word **personal** appears for **BCC email tracking** (per-user tracking address within an **organization**), not for a separate workspace (see completed CRM work TWI-336). That tracking data is still org-scoped (`email_tracking_addresses.organization_id`).

### Tasks

There is **no first-class `tasks` table** in Loop CRM schema yet. “Tasks” appear in agent/digital-worker planning docs (`docs/architecture/relationship-steward-agent-plan.md`) as future actions. For this plan, **tasks** means any future org-scoped task/note entity or worker `create_task` proposals—treat them like contacts: scoped to the active workspace org id.

---

## Gap analysis

| Requirement | Current behavior | Gap |
| --- | --- | --- |
| Personal CRM separate from company | Single org membership per login | Cannot hold company + personal memberships simultaneously |
| Org cannot see personal data | RLS isolates by org **if** actor is in that org only | No personal org exists; no switcher; no “personal” kind |
| Org membership ≠ personal access | RLS requires membership in target org | OK **once** personal org exists and org admins are not members of it |
| Not shared company records | All data keyed by `organization_id` | OK if personal org is a **different** org id with zero shared rows |
| User can use Loop for self | Signup creates **company** workspace only | No “personal workspace” path or empty state |
| Switch company ↔ personal | Only Super Admin workspace header | Need validated workspace selection for normal users |

**Root cause:** The product conflates “workspace” with “company organization,” and **`crm_users.hexclave_subject` uniqueness** enforces one workspace per human identity.

**Non-goals for the smallest viable design:** Cross-workspace search, merged contact graphs, copying org contacts into personal, or org admins “managing” personal workspaces.

---

## Recommended direction: personal org + multi-membership (smallest isolation-preserving change)

Reuse the existing **organization-scoped** data model and RLS. A personal workspace is a **separate `organizations` row** (separate `organization_id`), not a partition inside the company org.

### 1. Classify organizations

Add an explicit classification on `organizations` (exact column name TBD in implementation), for example:

- `workspace_kind`: `company` | `personal`  
  - Default `company` for all existing rows (migration backfill).
  - Personal rows: single intended human owner; name like “Personal” or derived from display name (copy TBD).

**Why not a new top-level tenant table?** Every query, RLS policy, and repository already keys off `organization_id`. A second table would duplicate isolation logic.

### 2. Allow multiple memberships per Hexclave subject

Replace “one row per subject” with “one row per (subject, organization)”:

- Drop or replace unique index on `crm_users.hexclave_subject`.
- Add unique index on `(hexclave_subject, organization_id)` (or equivalent).
- Update `findCrmUserBySubject` → split into:
  - `listMembershipsForSubject(subject)` for workspace picker / default selection, and
  - `findMembership(subject, organizationId)` for RLS + actor resolution.

**Authorization rule:** For non–Super Admin users, `organizationId` on the actor must come from **server-validated active membership**, optionally selected via a workspace context mechanism (see below)—never from an unverified header alone.

### 3. Workspace context for normal users (mirror Super Admin pattern safely)

Today only Super Admins use `X-Twiniti-Workspace-Id`. Extend the pattern:

1. Client sends requested workspace id (header + localStorage, same as today).
2. Server loads memberships for subject; **allows the request only if** requested id ∈ memberships.
3. If no header, use a persisted **default workspace** per user (new preference row or column)—**guess:** store on a new `user_workspace_preferences` table keyed by `hexclave_subject`, not on `crm_users`, to avoid ambiguity when multiple rows exist.

RLS transaction uses the **validated** org id + subject (unchanged mechanism in `auth-hook.ts`).

Company org admins who are **not** members of the personal org never pass `twiniti_is_active_member` for the personal org → **fail closed** (no rows).

### 4. Personal workspace provisioning

**New path (parallel to company signup):**

- After Hexclave sign-in, user chooses **Personal workspace** vs **Company workspace** (or “Create personal workspace” from switcher if they already have company).
- Personal provisioning:
  - Creates `organizations` with `workspace_kind = personal` and `residency_region` from user’s country selection (same country→region policy as company).
  - Creates single `crm_users` membership (role `admin` or a dedicated `owner`—**guess:** reuse `admin` with kind guardrails).
  - Seeds minimal org data (property definitions, etc.) same as `createOrganization` today.

**Invariants:**

- Do **not** auto-add company members to personal org.
- Do **not** expose personal org in company Settings → Members.
- Personal org member list API should only list the owner (**guess:** cap at one active human member unless product later allows sharing personal workspace).

### 5. Billing and licensing (decisions required)

Current code ties Stripe + License API to **organization** billing (`organization_billing`, `checkOrganizationLicense` on every request for non–Super Admin).

| Area | Company workspace | Personal workspace (proposal) |
| --- | --- | --- |
| Stripe | Org checkout required | **Guess:** separate product decision—free tier, individual Stripe price, or bundled with Twiniti account |
| License API | Required when configured | **Guess:** follow SignalDesk precedent (TWI-635): skip or lightweight check for personal kind only |
| Feature gating | Billing status blocks CRM routes | Personal may need `billingStatus: active` bypass or dedicated status |

Document the chosen policy in implementation; the plan only flags this as a **blocking product decision**, not solved here.

### 6. Product surface area by workspace kind

**Personal workspace (initial scope—minimize marketing blast radius):**

| Include (org-scoped, private) | Exclude or hide initially |
| --- | --- |
| Contacts, companies, import | Campaigns, segments (audience blast) |
| Email activities / BCC tracking (personal addresses) | Org-wide deliverability admin |
| Priority queue / overview | Multi-user invites (unless explicitly designed) |
| Help | Company billing admin for org they don’t own |
| **Guess:** simplified Settings | Digital workers / org agents at full parity |

**Company workspace:** unchanged.

UI: workspace switcher in sidebar (`Shell.tsx`) showing **kind** + name; reload `/api/v1/me` and regional routing after switch (regional API already follows org region—user may need regional redirect when switching between US/EU/UK workspaces; **guess:** same as Super Admin cross-region behavior today).

### 7. What must never be shared

These must remain strictly partitioned by `organization_id` (no cross-org joins, exports, or “copy from work” without explicit user action in a later feature):

| Domain | Tables / surfaces |
| --- | --- |
| **Contacts & companies** | `contacts`, `companies`, associations, properties, imports |
| **Mail** | `email_activities`, `email_tracking_addresses`, `email_sends`, `email_events`, Resend domain config |
| **Tasks (future)** | Any task/note tables; `action_proposals` / worker actions with `organization_id` |
| **Agents** | `agent_identities`, digital workers, MCP actor org |
| **Marketing** | Campaigns, lists, segments, workflows, forms |
| **Audit** | `audit_events` |

**Explicit anti-patterns:**

- Reusing company `organization_id` with a “visibility flag” on records (org members could still access via admin tools/API).
- Putting personal records in the **same** org as the company with role-based hiding only (RLS does not hide rows from co-members today).
- Letting company admins query “all orgs where user X is a member” from the **company** session (membership enumeration API must be scoped to **current org only**; personal org ids never appear in company member UI).

---

## Migration and empty states

### Existing users (company-only today)

| Cohort | Proposed handling |
| --- | --- |
| Active `crm_users` in company org | No automatic personal org. Offer **Create personal workspace** in switcher (opt-in). |
| `needsSetup` users | Onboarding choice: personal vs company (replace single company funnel). |
| Super Admins | Keep existing global directory; personal orgs appear in Super Admin lists (**guess:** filter badge `personal` for support clarity). |

### Data migration

- **Additive migration:** `workspace_kind` default `company` on all existing organizations.
- **No contact/mail data movement** in v1—personal org starts empty.
- **Index change** on `crm_users` requires migration + deploy ordering per `docs/DATABASE_CHANGE_POLICY.md` (expand: new unique index; contract: drop old unique on subject if safe after backfill verification).

### Empty state (personal)

- First open: zero contacts/companies; Overview metrics at zero.
- Copy: clarify “This workspace is only visible to you” (exact strings TBD).
- BCC tracking: prompt to configure only if personal product includes mail capture; may require personal Resend strategy (**guess:** stricter than company—possibly platform domain or user-owned domain policy).

### Empty state (company)

- Unchanged.

---

## How we will know it works (acceptance / verification)

### Automated

1. **RLS / security contract tests** (extend `apps/api/src/tests/security-contracts.test.ts` patterns):
   - User with memberships in `org_company` and `org_personal`: API calls with personal context return **only** personal rows; company admin token never reads personal org ids.
   - Attempt to set `X-Twiniti-Workspace-Id` to an org id **without** membership → 403 / empty RLS.
2. **Membership tests:** accept company invite after personal workspace exists (and vice versa) succeeds; two rows share same `hexclave_subject`, different `organization_id`.
3. **Regression:** existing single-org users behave as today when no second membership exists.

### Manual / E2E (post-implementation)

1. User A: create personal workspace → add contact Cp.
2. User A: join or create company workspace → add contact Cc.
3. Switcher: personal shows Cp only; company shows Cc only.
4. User B (company admin for User A’s company): member list **does not** show personal workspace; API cannot fetch Cp.
5. Optional: MCP/agent credentials scoped to company org cannot read personal org.

### Operational

- Regional health unchanged; personal org created in correct region cell per country policy.
- Audit logs for workspace create/switch events (implementation detail).

---

## Implementation phases (suggested, not scheduled)

1. **Schema + auth:** `workspace_kind`, multi-membership, validated workspace context for all users, `/api/v1/me` returns membership list + active workspace.
2. **Provisioning UX:** onboarding fork + “Create personal workspace.”
3. **Switcher UI + regional navigation.**
4. **Billing/license policy** for personal kind.
5. **Feature gating** (hide Growth section in personal kind).
6. **Docs/help** update (`docs/help/getting-started.md`, in-app Help).

Each phase should ship behind explicit George approval per `docs/RELEASE_POLICY.md`.

---

## Open questions (need George / product)

1. Personal workspace **pricing** and License API behavior.
2. Maximum members on a personal workspace (1 vs family/small team).
3. Whether personal workspace can exist **without** any company workspace (personal-only users).
4. Cross-region switcher UX when personal (EU) and company (US) differ—redirect rules.
5. Marketing features in personal v1: fully hidden vs read-only templates.

---

## References in repo

| Topic | Location |
| --- | --- |
| Actor / membership resolution | `packages/auth/src/index.ts` |
| RLS | `packages/db/drizzle/0008_organization_rls.sql`, `docs/architecture/organization-rls.md` |
| Org creation & invites | `apps/api/src/routes/organizations.ts`, `packages/db/src/repositories.ts` |
| Workspace header (Super Admin) | `apps/web/src/lib/api.ts`, `README.md` |
| Regional residency | `docs/REGIONAL_DATA.md` |
| Analogous multi-workspace product (SignalDesk, external) | Linear TWI-322, TWI-635 (**pattern reference only**) |

---

## Explicit guesses in this plan

- Default workspace preference storage mechanism (`user_workspace_preferences` vs column).
- Personal workspace Stripe/License treatment (SignalDesk-like skip for personal).
- Single-human-member cap on personal orgs.
- Initial feature surface (Growth section hidden in personal).
- Super Admin listing/filtering of personal orgs.

These guesses do not commit the implementation; they narrow the design space for the first engineering pass.
