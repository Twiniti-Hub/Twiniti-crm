const KEY = "twiniti.signupDraft";
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SignupDraft = {
  email: string;
  workspaceChoice: "personal" | "organization";
  displayName: string;
  companyName: string;
  countryCode: string;
};

/** Tab-local, non-credential form data survives the verification round trip. */
export function saveSignupDraft(storage: DraftStorage, draft: SignupDraft) {
  storage.setItem(KEY, JSON.stringify(draft));
}

export function readSignupDraft(storage: DraftStorage, email: string | null | undefined): SignupDraft | null {
  try {
    const draft = JSON.parse(storage.getItem(KEY) ?? "null");
    if (!draft || !email || typeof draft.email !== "string"
      || draft.email.trim().toLowerCase() !== email.trim().toLowerCase()
      || !["personal", "organization"].includes(draft.workspaceChoice)
      || ![draft.displayName, draft.companyName, draft.countryCode].every((value) => typeof value === "string")) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearSignupDraft(storage: DraftStorage) {
  storage.removeItem(KEY);
}
