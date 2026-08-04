const API_BASE = import.meta.env.VITE_API_URL ?? "";
const WORKSPACE_CONTEXT_KEY = "twiniti.activeWorkspaceId";
const WORKSPACE_CONTEXT_HEADER = "X-Twiniti-Workspace-Id";

let browserAuthorizationHeader: string | null = null;

/** Keep the current React-derived auth header available to non-React API helpers. */
export function setBrowserAuthorizationHeader(value: string | null) {
  browserAuthorizationHeader = value;
}

export function getWorkspaceContextId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WORKSPACE_CONTEXT_KEY);
}

export function setWorkspaceContextId(workspaceId: string) {
  window.localStorage.setItem(WORKSPACE_CONTEXT_KEY, workspaceId);
}

export function clearWorkspaceContextId() {
  window.localStorage.removeItem(WORKSPACE_CONTEXT_KEY);
}

export async function api(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("Authorization") && browserAuthorizationHeader) {
    headers.set("Authorization", browserAuthorizationHeader);
  }
  const workspaceId = getWorkspaceContextId();
  if (workspaceId && !headers.has(WORKSPACE_CONTEXT_HEADER)) {
    headers.set(WORKSPACE_CONTEXT_HEADER, workspaceId);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      json?.error?.message
      ?? (json?.reason === "duplicate_email"
        ? `Duplicate email — existing contact ${json.existing_contact_id ?? "unknown"}`
        : null)
      ?? res.statusText;
    throw new Error(message);
  }
  return json;
}
