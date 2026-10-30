const place = {
  uk: "the United Kingdom",
  eu: "the European Union",
  us: "the United States",
};

export const title = "New user sign-up";

export const colors = {
  Start: "blue",
  Account: "purple",
  Workspace: "teal",
  Refused: "orange",
};

export const group = (v) => {
  if (v.phase === "form" || v.phase === "auth_failed") return "Start";
  if (v.phase === "account") return "Account";
  if (v.phase === "region_locked") return "Refused";
  return "Workspace";
};

export const state = (v) => {
  if (v.phase === "form") return "Filling in the form";
  if (v.phase === "auth_failed") return "Sign-up rejected";
  if (v.phase === "account") return "Account created, workspace not saved yet";
  if (v.phase === "region_locked") return "Country change refused";
  const where = place[v.storedRegion] ?? "an unknown region";
  if (v.phase === "checkout") return `Checkout for a workspace in ${where}`;
  return `Workspace in ${where}`;
};

const where = {
  GB: "the United Kingdom",
  DE: "the European Union",
  US: "the United States",
};

export const step = (action, _from, to) => {
  if (action === "NothingFurtherHappens") return null;
  if (action === "ThePasswordIsRejected") return "the password is rejected";
  if (action === "TheWorkspaceIsSaved") return "the workspace is saved";
  if (action === "YouContinueToCheckout") return "you continue to checkout";
  if (action === "YouSubmit") return `you submit a company in ${where[to.country]}`;
  if (action === "YouSubmitAgain" && to.phase === "region_locked") {
    return "you try a country in another region";
  }
  if (action === "YouSubmitAgain" && to.phase === "workspace") {
    return "you submit the saved country again";
  }
  return null;
};
