---- MODULE Signup ----
\* New-user signup for one person, personal or company workspace, then Stripe and the license server.
\* Code: apps/web/src/pages/SignUpPage.tsx (credential, then POST /api/v1/organizations)
\*       apps/api/src/routes/organizations.ts (region lock, then license enqueue, then checkout)
\*       apps/api/src/routes/billing.ts (checkout session, Stripe webhook, subscription sync enqueue)
\*       apps/api/src/license-jobs.ts (processLicenseSubscriptionSync marks the license provisioned)
\*       packages/db/src/repositories.ts createOrganization
\*       packages/contracts/src/index.ts regionForCountry
\*
\* The create request queues license.provision before the customer pays.
\* This model treats the clean license as the subscription sync after a successful payment.
\* Personal and company paths share residency locking and CleanLicenseFollowsPayment.
\* Countries stand for the three residency cells: GB -> uk, DE -> eu, US -> us.

EXTENDS Naturals

Countries == {"GB", "DE", "US"}
WorkspaceKinds == {"personal", "company"}

RegionOf(c) ==
  CASE c = "GB" -> "uk"
    [] c = "DE" -> "eu"
    [] c = "US" -> "us"

VARIABLES
  phase,
  country,
  firstCountry,
  storedRegion,
  workspaceKind,
  account,
  admin,
  payment,
  licenseIssued

vars == <<phase, country, firstCountry, storedRegion, workspaceKind, account, admin, payment, licenseIssued>>

Init ==
  /\ phase = "form"
  /\ country = ""
  /\ firstCountry = ""
  /\ storedRegion = ""
  /\ workspaceKind = "none"
  /\ account = FALSE
  /\ admin = FALSE
  /\ payment = "none"
  /\ licenseIssued = FALSE

YouSubmit(c, kind) ==
  /\ phase = "form"
  /\ c \in Countries
  /\ kind \in WorkspaceKinds
  /\ country' = c
  /\ workspaceKind' = kind
  /\ account' = TRUE
  /\ phase' = "account"
  /\ UNCHANGED <<firstCountry, storedRegion, admin, payment, licenseIssued>>

YouSubmitUnitedKingdomPersonal == YouSubmit("GB", "personal")
YouSubmitEuropeanUnionPersonal == YouSubmit("DE", "personal")
YouSubmitUnitedStatesPersonal == YouSubmit("US", "personal")
YouSubmitUnitedKingdomCompany == YouSubmit("GB", "company")
YouSubmitEuropeanUnionCompany == YouSubmit("DE", "company")
YouSubmitUnitedStatesCompany == YouSubmit("US", "company")

ThePasswordIsRejected ==
  /\ phase = "form"
  /\ phase' = "auth_failed"
  /\ UNCHANGED <<country, firstCountry, storedRegion, workspaceKind, account, admin, payment, licenseIssued>>

TheWorkspaceIsSaved ==
  /\ phase = "account"
  /\ storedRegion = ""
  /\ workspaceKind \in WorkspaceKinds
  /\ firstCountry' = country
  /\ storedRegion' = RegionOf(country)
  /\ admin' = TRUE
  /\ phase' = "workspace"
  /\ UNCHANGED <<country, workspaceKind, account, payment, licenseIssued>>

YouStartPayment ==
  /\ phase = "workspace"
  /\ payment' = "open"
  /\ phase' = "paying"
  /\ UNCHANGED <<country, firstCountry, storedRegion, workspaceKind, account, admin, licenseIssued>>

ThePaymentSucceeds ==
  /\ phase = "paying"
  /\ payment' = "paid"
  /\ phase' = "paid"
  /\ UNCHANGED <<country, firstCountry, storedRegion, workspaceKind, account, admin, licenseIssued>>

ThePaymentIsCanceled ==
  /\ phase = "paying"
  /\ payment' = "canceled"
  /\ phase' = "payment_canceled"
  /\ UNCHANGED <<country, firstCountry, storedRegion, workspaceKind, account, admin, licenseIssued>>

YouTryPaymentAgain ==
  /\ phase = "payment_canceled"
  /\ payment' = "open"
  /\ phase' = "paying"
  /\ UNCHANGED <<country, firstCountry, storedRegion, workspaceKind, account, admin, licenseIssued>>

TheLicenseServerIssuesACleanLicense ==
  /\ phase = "paid"
  /\ payment = "paid"
  /\ licenseIssued' = TRUE
  /\ phase' = "licensed"
  /\ UNCHANGED <<country, firstCountry, storedRegion, workspaceKind, account, admin, payment>>

YouSubmitAgain(c) ==
  /\ phase \in {"workspace", "paying", "paid", "payment_canceled", "licensed", "region_locked"}
  /\ account = TRUE
  /\ storedRegion # ""
  /\ c \in Countries
  /\ country' = c
  /\ LET resumed ==
       IF licenseIssued THEN "licensed"
       ELSE IF payment = "paid" THEN "paid"
       ELSE IF payment = "open" THEN "paying"
       ELSE IF payment = "canceled" THEN "payment_canceled"
       ELSE "workspace"
     IN phase' = IF RegionOf(c) = storedRegion THEN resumed ELSE "region_locked"
  /\ UNCHANGED <<firstCountry, storedRegion, workspaceKind, account, admin, payment, licenseIssued>>

YouSubmitUnitedKingdomAgain == YouSubmitAgain("GB")
YouSubmitEuropeanUnionAgain == YouSubmitAgain("DE")
YouSubmitUnitedStatesAgain == YouSubmitAgain("US")

NothingFurtherHappens ==
  /\ phase \in {"licensed", "auth_failed"}
  /\ UNCHANGED vars

Next ==
  \/ YouSubmitUnitedKingdomPersonal
  \/ YouSubmitEuropeanUnionPersonal
  \/ YouSubmitUnitedStatesPersonal
  \/ YouSubmitUnitedKingdomCompany
  \/ YouSubmitEuropeanUnionCompany
  \/ YouSubmitUnitedStatesCompany
  \/ ThePasswordIsRejected
  \/ TheWorkspaceIsSaved
  \/ YouStartPayment
  \/ ThePaymentSucceeds
  \/ ThePaymentIsCanceled
  \/ YouTryPaymentAgain
  \/ TheLicenseServerIssuesACleanLicense
  \/ YouSubmitUnitedKingdomAgain
  \/ YouSubmitEuropeanUnionAgain
  \/ YouSubmitUnitedStatesAgain
  \/ NothingFurtherHappens

Spec == Init /\ [][Next]_vars

WorkspaceMatchesCountry ==
  storedRegion = "" \/ storedRegion = RegionOf(firstCountry)

CreatorIsAdmin ==
  admin = (storedRegion # "")

RejectedPasswordStoresNothing ==
  phase = "auth_failed" =>
    account = FALSE /\ storedRegion = "" /\ admin = FALSE /\ payment = "none" /\ licenseIssued = FALSE /\ workspaceKind = "none"

CountryChangeIsRefused ==
  /\ (phase = "region_locked" =>
       /\ storedRegion # ""
       /\ country \in Countries
       /\ RegionOf(country) # storedRegion
       /\ storedRegion = RegionOf(firstCountry))
  /\ (storedRegion # "" /\ country \in Countries /\ RegionOf(country) # storedRegion =>
       phase = "region_locked")

\* A clean license is issued only after Stripe has recorded a successful payment,
\* for both personal and company workspaces, and payment never moves the saved region.
CleanLicenseFollowsPayment ==
  /\ (licenseIssued => payment = "paid" /\ storedRegion # "" /\ admin /\ workspaceKind \in WorkspaceKinds)
  /\ (phase = "licensed" => licenseIssued)
  /\ (phase = "paid" => payment = "paid" /\ ~licenseIssued)
  /\ (phase = "paying" => payment = "open" /\ ~licenseIssued)
  /\ (phase = "payment_canceled" => payment = "canceled" /\ ~licenseIssued)
  /\ (payment = "none" => ~licenseIssued)

WorkspaceKindIsChosen ==
  storedRegion # "" => workspaceKind \in WorkspaceKinds

====
