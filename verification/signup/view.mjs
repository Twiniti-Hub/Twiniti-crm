const place = {
  uk: "the United Kingdom",
  eu: "the European Union",
  us: "the United States",
};

const where = {
  GB: "the United Kingdom",
  DE: "the European Union",
  US: "the United States",
};

export const title = "New user sign-up";

export const colors = {
  Start: "blue",
  Account: "purple",
  Workspace: "teal",
  Payment: "pink",
  License: "yellow",
  Refused: "orange",
};

export const group = (v) => {
  if (v.phase === "form" || v.phase === "auth_failed") return "Start";
  if (v.phase === "account") return "Account";
  if (v.phase === "region_locked") return "Refused";
  if (v.phase === "paying" || v.phase === "paid" || v.phase === "payment_canceled") return "Payment";
  if (v.phase === "licensed") return "License";
  return "Workspace";
};

export const state = (v) => {
  if (v.phase === "form") return "Filling in the form";
  if (v.phase === "auth_failed") return "Sign-up rejected";
  if (v.phase === "account") return "Account created, workspace not saved yet";
  if (v.phase === "region_locked") return "Country change refused";
  if (v.phase === "paying") return "Paying with Stripe";
  if (v.phase === "paid") return "Payment recorded";
  if (v.phase === "payment_canceled") return "Payment canceled";
  if (v.phase === "licensed") return "Clean license issued";
  const region = place[v.storedRegion] ?? "an unknown region";
  return `Workspace in ${region}`;
};

export const step = (action, from, to) => {
  if (action === "NothingFurtherHappens") return null;
  if (action === "ThePasswordIsRejected") return "the password is rejected";
  if (action === "TheWorkspaceIsSaved") return "the workspace is saved";
  if (action === "YouStartPayment") return "you start payment";
  if (action === "ThePaymentSucceeds") return "Stripe records the payment";
  if (action === "ThePaymentIsCanceled") return "you cancel payment";
  if (action === "YouTryPaymentAgain") return "you try payment again";
  if (action === "TheLicenseServerIssuesACleanLicense") return "the license server issues a clean license";
  if (action === "YouSubmit") return `you submit a company in ${where[to.country]}`;
  if (action === "YouSubmitAgain" && from.phase === "workspace" && to.phase === "region_locked") {
    return "you try a country in another region";
  }
  if (action === "YouSubmitAgain" && from.phase === "region_locked" && to.phase === "workspace") {
    return "you submit the saved country again";
  }
  return null;
};
