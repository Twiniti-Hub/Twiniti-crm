export type CsvRow = Record<string, string>;

export type ImportFieldClassification = {
  contactFields: string[];
  propertyFields: string[];
  undefinedPropertyFields: string[];
};

const CONTACT_FIELD_NAMES = new Set([
  "email",
  "email_address",
  "emailaddress",
  "phone",
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
  "firstname",
  "first_name",
  "lastname",
  "last_name",
  "lifecyclestage",
  "lifecycle_stage",
  "id",
  "hs_object_id",
  "hs_objectid",
  "record_id",
  "contact_id"
]);

export function normalizeImportFieldName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^([^a-z])/, "p_$1");
}

/** Parse a comma-separated file, including quoted commas and line breaks. */
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      record.push(value);
      value = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      if (record.some((cell) => cell.trim() !== "")) records.push(record);
      record = [];
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (value.length > 0 || record.length > 0) {
    record.push(value);
    if (record.some((cell) => cell.trim() !== "")) records.push(record);
  }
  if (records.length === 0) throw new Error("CSV file is empty");

  const headers = records[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());
  if (headers.some((header) => !header)) throw new Error("CSV headers cannot be empty");

  const seen = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeImportFieldName(header);
    if (seen.has(normalized)) throw new Error(`CSV contains duplicate header: ${header}`);
    seen.add(normalized);
  }

  const rows = records.slice(1).map((cells) => {
    const row: CsvRow = {};
    for (let index = 0; index < headers.length; index += 1) row[headers[index]] = cells[index] ?? "";
    return row;
  });

  return { headers, rows };
}

export function classifyImportFields(
  headers: string[],
  definedPropertyNames: Iterable<string> = []
): ImportFieldClassification {
  const definedProperties = new Set(Array.from(definedPropertyNames, normalizeImportFieldName));
  const contactFields: string[] = [];
  const propertyFields: string[] = [];
  const undefinedPropertyFields: string[] = [];

  for (const header of headers) {
    const normalized = normalizeImportFieldName(header);
    if (CONTACT_FIELD_NAMES.has(normalized)) {
      contactFields.push(header);
    } else {
      propertyFields.push(header);
      if (definedProperties.size > 0 && !definedProperties.has(normalized)) undefinedPropertyFields.push(header);
    }
  }

  return { contactFields, propertyFields, undefinedPropertyFields };
}

export function mapImportRowsToPropertyDefinitions(
  rows: Record<string, unknown>[],
  definitions: Array<{ internalName: string; label?: string | null }>
): Record<string, unknown>[] {
  const propertyAliases = new Map<string, string>();
  for (const definition of definitions) {
    propertyAliases.set(normalizeImportFieldName(definition.internalName), definition.internalName);
    if (definition.label) propertyAliases.set(normalizeImportFieldName(definition.label), definition.internalName);
  }

  return rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(row)) {
      const propertyName = propertyAliases.get(normalizeImportFieldName(header));
      mapped[propertyName && !CONTACT_FIELD_NAMES.has(normalizeImportFieldName(header)) ? propertyName : header] = value;
    }
    return mapped;
  });
}
