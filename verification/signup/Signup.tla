---- MODULE Signup ----
\* New-user signup for one person, one company workspace.
\* Code: apps/web/src/pages/SignUpPage.tsx (credential, then POST /api/v1/organizations)
\*       apps/api/src/routes/organizations.ts (region lock on an existing workspace)
\*       packages/db/src/repositories.ts createOrganization (region written only on insert)
\*       packages/contracts/src/index.ts regionForCountry
\*
\* Countries stand for the three residency cells: GB -> uk, DE -> eu, US -> us.

EXTENDS Naturals

Countries == {"GB", "DE", "US"}

RegionOf(c) ==
  CASE c = "GB" -> "uk"
    [] c = "DE" -> "eu"
    [] c = "US" -> "us"

VARIABLES
  phase,
  country,
  firstCountry,
  storedRegion,
  account,
  admin

vars == <<phase, country, firstCountry, storedRegion, account, admin>>

Init ==
  /\ phase = "form"
  /\ country = ""
  /\ firstCountry = ""
  /\ storedRegion = ""
  /\ account = FALSE
  /\ admin = FALSE

YouSubmit(c) ==
  /\ phase = "form"
  /\ c \in Countries
  /\ country' = c
  /\ account' = TRUE
  /\ phase' = "account"
  /\ UNCHANGED <<firstCountry, storedRegion, admin>>

YouSubmitUnitedKingdom == YouSubmit("GB")
YouSubmitEuropeanUnion == YouSubmit("DE")
YouSubmitUnitedStates == YouSubmit("US")

ThePasswordIsRejected ==
  /\ phase = "form"
  /\ phase' = "auth_failed"
  /\ UNCHANGED <<country, firstCountry, storedRegion, account, admin>>

TheWorkspaceIsSaved ==
  /\ phase = "account"
  /\ storedRegion = ""
  /\ firstCountry' = country
  /\ storedRegion' = RegionOf(country)
  /\ admin' = TRUE
  /\ phase' = "workspace"
  /\ UNCHANGED <<country, account>>

YouContinueToCheckout ==
  /\ phase = "workspace"
  /\ phase' = "checkout"
  /\ UNCHANGED <<country, firstCountry, storedRegion, account, admin>>

YouSubmitAgain(c) ==
  /\ phase \in {"workspace", "checkout", "region_locked"}
  /\ account = TRUE
  /\ storedRegion # ""
  /\ c \in Countries
  /\ country' = c
  /\ IF RegionOf(c) = storedRegion
     THEN phase' = "workspace"
     ELSE phase' = "region_locked"
  /\ UNCHANGED <<firstCountry, storedRegion, account, admin>>

YouSubmitUnitedKingdomAgain == YouSubmitAgain("GB")
YouSubmitEuropeanUnionAgain == YouSubmitAgain("DE")
YouSubmitUnitedStatesAgain == YouSubmitAgain("US")

NothingFurtherHappens ==
  /\ phase \in {"checkout", "auth_failed"}
  /\ UNCHANGED vars

Next ==
  \/ YouSubmitUnitedKingdom
  \/ YouSubmitEuropeanUnion
  \/ YouSubmitUnitedStates
  \/ ThePasswordIsRejected
  \/ TheWorkspaceIsSaved
  \/ YouContinueToCheckout
  \/ YouSubmitUnitedKingdomAgain
  \/ YouSubmitEuropeanUnionAgain
  \/ YouSubmitUnitedStatesAgain
  \/ NothingFurtherHappens

Spec == Init /\ [][Next]_vars

\* A saved workspace stays in the region of the country chosen on the first save.
WorkspaceMatchesCountry ==
  storedRegion = "" \/ storedRegion = RegionOf(firstCountry)

\* The person who created the workspace is its company admin, and only then.
CreatorIsAdmin ==
  admin = (storedRegion # "")

\* A rejected password never creates an account or a workspace.
RejectedPasswordStoresNothing ==
  phase = "auth_failed" => account = FALSE /\ storedRegion = "" /\ admin = FALSE

\* A later country that maps to another region is refused and the stored region stays.
CountryChangeIsRefused ==
  phase = "region_locked" =>
    /\ storedRegion # ""
    /\ RegionOf(country) # storedRegion
    /\ storedRegion = RegionOf(firstCountry)

====
