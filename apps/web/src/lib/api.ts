const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
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
