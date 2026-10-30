---
name: verify-signup-residency
description: Use when changing new-user sign-up, organization create, Stripe checkout, or license provisioning. Checks residency lock, and that a clean license follows a successful Stripe payment.
---

# Verify signup residency

A new company workspace is stored in the region of the country on the first successful sign-up, and a later sign-up with another country does not move it. If that breaks, a person's company data can land in the wrong residency cell or move after they already have a workspace.

## When a change touches this

Read the diff. Run this skill when it changes any of:

- `apps/web/src/pages/SignUpPage.tsx` (`onSubmit`: credential sign-up, then `POST /api/v1/organizations` with `countryCode` and `joinAsAdmin: true`)
- `apps/api/src/routes/organizations.ts` (`app.post("/api/v1/organizations")`, the `region_locked` response)
- `packages/db/src/repositories.ts` (`createOrganization`)
- `packages/contracts/src/index.ts` (`regionForCountry`)
- `apps/api/src/routes/billing.ts` (`createOrganizationCheckoutSession`, `POST /api/v1/webhooks/stripe`)
- `apps/api/src/license-jobs.ts` (`enqueueLicenseProvisioning`, `processLicenseSubscriptionSync`)

The promise is the one in `docs/REGIONAL_DATA.md`: `GB` is `uk`, an EU country is `eu`, every other supported country is `us`, and the stored region does not change through the product.

## Run

From the repo root:

```bash
node --experimental-strip-types verification/signup/check.mjs
```

Exit 0 prints `signup residency check passed`. Any other exit is a failed check. The script needs Node 22 and the repo's `zod` install (`pnpm install` at the root if the import of `@` is not the issue; the script imports `packages/contracts/src/index.ts` directly).

Then read the result with `/statechart` on `verification/signup/Signup.tla`, using `verification/signup/Signup.cfg` and `verification/signup/view.mjs`. `/statechart` draws the sign-up chart and names any broken rule as its shortest path. Do not treat a green `check.mjs` as a pass if `/statechart` reports a broken rule.

## What passing means

`check.mjs` passes only when all of these are true in the current tree:

- `regionForCountry` returns `uk` for `GB`, `eu` for `DE` and `FR`, and `us` for `US`, `CA`, and `AU`.
- `createOrganization` returns an existing row for the same subject before it inserts, and it never calls `db.update` on `organizations`.
- `POST /api/v1/organizations` still has the guard `!created.created && joinAsAdmin && created.organization.residencyRegion !== regionForCountry(input.countryCode)` and returns `region_locked` before `createOrganizationCheckoutSession`.
- That same handler queues `enqueueLicenseProvisioning` after the region lock and before checkout.
- The Stripe webhook reaches `enqueueLicenseSubscriptionSync` after `checkout.session.completed`.
- `processLicenseSubscriptionSync` calls `synchronizeSubscriptionState` and sets `licenseProvisioningStatus` to `provisioned`.

`/statechart` on the spec passes when these rules hold for one person and the countries `GB`, `DE`, and `US`:

- **WorkspaceMatchesCountry.** The saved region is the region of the country on the first save.
- **CreatorIsAdmin.** That person is the company admin exactly when a workspace is saved.
- **RejectedPasswordStoresNothing.** A rejected password stores no account and no workspace.
- **CountryChangeIsRefused.** A saved workspace whose submitted country maps to another region is in the refused phase, and that phase only happens for a cross-region country. The saved region is still the first country's region. Sending that submission to the workspace phase fails this rule even when the saved region is left unchanged.
- **CleanLicenseFollowsPayment.** A clean license is issued only after Stripe has recorded a successful payment, for a saved workspace whose creator is the admin. Paying, a recorded payment, and a canceled payment stay in those payment states until the license action, and a canceled payment does not issue a license.

The spec's `Next` is the disjunction of the sign-up actions. `NothingFurtherHappens` only stutters on a clean license and on a rejected password so TLC's deadlock check stays quiet. The view hides that stutter. It also hides a country retry that stays on the same label, a country retry during payment or after the license, and the return from a refused country change back to paying, a recorded payment, a canceled payment, or the issued license. Those payment and license states stay reachable from "you start payment".

## A real break versus a modeling error

A real break fails `check.mjs` or shows a `/statechart` rule with a path you can replay on the code:

1. The person submits the form (`SignUpPage` `onSubmit`).
2. The credential call succeeds and the page posts `{ name, countryCode, joinAsAdmin: true }`.
3. `createOrganization` inserts `residencyRegion` from `regionForCountry` on the first save, or returns the existing row when the subject already has a workspace.
4. The route compares that stored region to `regionForCountry` of the new country and responds `409` `region_locked` when they differ, before billing checkout.
5. Stripe checkout is `createOrganizationCheckoutSession`. A successful payment is the webhook (`checkout.session.completed` or the subscription events) followed by `enqueueLicenseSubscriptionSync`.
6. `processLicenseSubscriptionSync` updates the license server and marks the license provisioned. That is the clean license. It is only enabled in the model after payment is `paid`.

If `check.mjs` fails on the `region_locked` text, the handler no longer refuses the move. Removing that `if` is a known failing variant: `check.mjs` exits 1 with `region lock is checked before checkout`.

If `/statechart` fails while `check.mjs` passes, replay the numbered path on the code before changing the spec. A path that the code cannot take is a modeling error: fix `verification/signup/Signup.tla` so each action is still one step of the code above, and do not drop the rule.

## After an intended change

Update the spec, the view, and `check.mjs` so they still describe the code. Run `check.mjs` and `/statechart` again. Move the sync commit below forward only after that run matches the tree.

- Sync commit: `eca33a039a851211872bdfb1cb327d0b53aa5865`
- Covered functions: `SignUpPage` `onSubmit`, `registerOrganizationRoutes` `POST /api/v1/organizations`, `createOrganization`, `regionForCountry`, `createOrganizationCheckoutSession`, the Stripe webhook handler, `processLicenseSubscriptionSync`.

## Left out

Email already exists, password rules beyond a single rejection, unverified email, super-admin create, admin invite and its rollback, the router picking a regional API, and two creates in flight. The create request also queues `license.provision` before the customer pays; this model does not treat that early job as the clean license. Trial versus active, invoice payment failure after a recorded payment, and webhook reordering are out. The model is one person and three countries, not every ISO code. `check.mjs` does not execute Stripe or the database.
