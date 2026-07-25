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
  "phone",
  "firstname",
  "lastname",
  "lifecyclestage"
]);

export const HUBSPOT_CONTACT_COMPANY_FIELD_ALIASES = new Set([
  "company",
  "company_name",
  "companyname",
  "associatedcompany",
  "associated_company",
  "primary_company",
  "primary_company_name"
]);

export const HUBSPOT_CONTACT_FIELD_ALIASES = new Set([
  ...HUBSPOT_CORE_CONTACT_FIELDS,
  ...HUBSPOT_CONTACT_COMPANY_FIELD_ALIASES,
  "email_address",
  "emailaddress",
  "phone_number",
  "mobilephone",
  "linkedin",
  "linkedin_url",
  "linkedin_profile",
  "linkedin_profile_url",
  "facebook",
  "facebook_url",
  "facebook_profile",
  "facebook_profile_url",
  "external_id",
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
  phone: string | null;
  identities: {
    linkedin: string | null;
    facebook: string | null;
  };
  firstName: string | null;
  lastName: string | null;
  lifecycleStage: string | null;
  companyName: string | null;
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "invalid email" };

  const phone = pickString(row, "phone", "Phone", "phone_number", "mobilephone", "Mobile Phone");
  const linkedin = pickString(row, "linkedin", "LinkedIn", "linkedin_url", "LinkedIn URL", "linkedin_profile", "LinkedIn Profile", "linkedin_profile_url");
  const facebook = pickString(row, "facebook", "Facebook", "facebook_url", "Facebook URL", "facebook_profile", "Facebook Profile", "facebook_profile_url");
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
  const companyName = pickString(
    row,
    "company",
    "Company",
    "Company Name",
    "company_name",
    "companyName",
    "Associated Company",
    "associated_company",
    "associatedcompany",
    "Primary Company",
    "primary_company",
    "Primary Company Name",
    "primary_company_name"
  );
  const externalId = pickString(
    row,
    "id",
    "hs_object_id",
    "hs_objectId",
    "record_id",
    "contact_id",
    "Record ID",
    "Contact ID",
    "External ID",
    "external_id"
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
    phone,
    identities: { linkedin, facebook },
    firstName,
    lastName,
    lifecycleStage,
    companyName,
    properties,
    externalId,
    unmappedKeys
  };
}
