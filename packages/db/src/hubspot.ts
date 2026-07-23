export type PropertyDataType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "multi_enum"
  | "json";

/** HubSpot contact fields that map to first-class columns. */
export const HUBSPOT_CORE_CONTACT_FIELDS = new Set([
  "email",
  "firstname",
  "lastname",
  "lifecyclestage"
]);

export function mapHubspotPropertyType(
  type: string | undefined,
  fieldType: string | undefined
): PropertyDataType {
  const t = (type ?? "").toLowerCase();
  const ft = (fieldType ?? "").toLowerCase();
  if (t === "number" || ft === "number") return "number";
  if (t === "bool" || t === "boolean" || ft === "booleancheckbox") return "boolean";
  if (t === "date" || t === "datetime" || ft === "date") return "date";
  if (t === "enumeration" && (ft === "checkbox" || ft === "checkboxselect")) return "multi_enum";
  if (t === "enumeration" || ft === "select" || ft === "radio") return "enum";
  if (t === "json" || ft === "html" || ft === "file") return "json";
  return "string";
}

export function normalizeHubspotInternalName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^([^a-z])/, "p_$1");
}

export type MappedContactRow = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  lifecycleStage: string | null;
  properties: Record<string, unknown>;
  externalId: string | null;
  unmappedKeys: string[];
};

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Map a HubSpot-style contact row onto core columns + defined custom properties.
 * Unknown keys (not in definitions and not core) are reported as unmapped and dropped.
 */
export function mapHubspotContactRow(
  row: Record<string, unknown>,
  definedInternalNames: Set<string>
): MappedContactRow | { error: string } {
  const email = pickString(row, "email", "Email") ?? "";
  if (!email) return { error: "missing email" };

  const firstName = pickString(row, "firstname", "firstName", "first_name");
  const lastName = pickString(row, "lastname", "lastName", "last_name");
  const lifecycleStage = pickString(row, "lifecyclestage", "lifecycleStage", "lifecycle_stage");
  const externalId = pickString(row, "id", "hs_object_id", "hs_objectId") ?? null;

  const properties: Record<string, unknown> = {};
  const unmappedKeys: string[] = [];

  for (const [rawKey, value] of Object.entries(row)) {
    const key = normalizeHubspotInternalName(rawKey);
    if (HUBSPOT_CORE_CONTACT_FIELDS.has(key)) continue;
    if (key === "id" || key === "hs_object_id") continue;
    if (!definedInternalNames.has(key)) {
      unmappedKeys.push(rawKey);
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    properties[key] = value;
  }

  return {
    email,
    firstName,
    lastName,
    lifecycleStage,
    properties,
    externalId,
    unmappedKeys
  };
}
