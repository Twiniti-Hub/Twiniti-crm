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

const HUBSPOT_CONTACT_FIELD_ALIASES = new Set([
  ...HUBSPOT_CORE_CONTACT_FIELDS,
  "email_address",
  "emailaddress",
  "first_name",
  "last_name",
  "lifecycle_stage",
  "hs_object_id",
  "hs_objectid",
  "record_id",
  "contact_id"
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
  const email = pickString(row, "email", "Email", "Email Address", "email_address", "emailaddress") ?? "";
  if (!email) return { error: "missing email" };

  const firstName = pickString(row, "firstname", "firstName", "first_name", "First Name", "FirstName");
  const lastName = pickString(row, "lastname", "lastName", "last_name", "Last Name", "LastName");
  const lifecycleStage = pickString(
    row,
    "lifecyclestage",
    "lifecycleStage",
    "lifecycle_stage",
    "Lifecycle Stage",
    "LifecycleStage"
  );
  const externalId = pickString(
    row,
    "id",
    "hs_object_id",
    "hs_objectId",
    "record_id",
    "contact_id",
    "Record ID",
    "Contact ID"
  ) ?? null;

  const properties: Record<string, unknown> = {};
  const unmappedKeys: string[] = [];

  for (const [rawKey, value] of Object.entries(row)) {
    const key = normalizeHubspotInternalName(rawKey);
    if (HUBSPOT_CONTACT_FIELD_ALIASES.has(key) || key === "id") continue;
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
