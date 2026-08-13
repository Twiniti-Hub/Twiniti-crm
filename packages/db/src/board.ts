export type BoardObjectType = "contact" | "company";

export type BoardLaneDefinition = {
  id: string;
  label: string;
  /** Canonical stored slug, or null for Unassigned / sentinel for Other. */
  value: string | null;
  kind: "unassigned" | "value" | "other";
};

export const CONTACT_LIFECYCLE_LANES: BoardLaneDefinition[] = [
  { id: "unassigned", label: "Unassigned", value: null, kind: "unassigned" },
  { id: "subscriber", label: "Subscriber", value: "subscriber", kind: "value" },
  { id: "lead", label: "Lead", value: "lead", kind: "value" },
  { id: "marketingqualifiedlead", label: "Marketing Qualified Lead", value: "marketingqualifiedlead", kind: "value" },
  { id: "salesqualifiedlead", label: "Sales Qualified Lead", value: "salesqualifiedlead", kind: "value" },
  { id: "opportunity", label: "Opportunity", value: "opportunity", kind: "value" },
  { id: "customer", label: "Customer", value: "customer", kind: "value" },
  { id: "evangelist", label: "Evangelist", value: "evangelist", kind: "value" },
  { id: "other", label: "Other", value: null, kind: "other" }
];

export const COMPANY_LIFECYCLE_LANES: BoardLaneDefinition[] = [
  { id: "unassigned", label: "Unassigned", value: null, kind: "unassigned" },
  { id: "prospect", label: "Prospect", value: "prospect", kind: "value" },
  { id: "qualified", label: "Qualified", value: "qualified", kind: "value" },
  { id: "customer", label: "Customer", value: "customer", kind: "value" },
  { id: "partner", label: "Partner", value: "partner", kind: "value" },
  { id: "former_customer", label: "Former Customer", value: "former_customer", kind: "value" },
  { id: "other", label: "Other", value: null, kind: "other" }
];

export function defaultLanesForObject(objectType: BoardObjectType): BoardLaneDefinition[] {
  return objectType === "contact" ? CONTACT_LIFECYCLE_LANES : COMPANY_LIFECYCLE_LANES;
}

export function defaultCompanyLifecycleStage(): string {
  return "prospect";
}

/** Normalize a stored stage for case-insensitive slug comparison. */
export function normalizeStageSlug(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function resolveLaneId(
  lanes: BoardLaneDefinition[],
  rawValue: string | null | undefined
): string {
  const normalized = normalizeStageSlug(rawValue);
  if (normalized == null) {
    return lanes.find((lane) => lane.kind === "unassigned")?.id ?? "unassigned";
  }
  const match = lanes.find(
    (lane) => lane.kind === "value" && lane.value != null && lane.value.toLowerCase() === normalized
  );
  if (match) return match.id;
  return lanes.find((lane) => lane.kind === "other")?.id ?? "other";
}

export function laneValueForWrite(
  lanes: BoardLaneDefinition[],
  laneId: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  const lane = lanes.find((item) => item.id === laneId);
  if (!lane) return { ok: false, error: `Unknown lane: ${laneId}` };
  if (lane.kind === "unassigned") return { ok: true, value: null };
  if (lane.kind === "other") {
    return { ok: false, error: "Cannot move a record into the Other lane; set a concrete stage value" };
  }
  return { ok: true, value: lane.value };
}

export type DefaultBoardConfig = {
  groupingField: string;
  lanes: BoardLaneDefinition[];
  cardFields: string[];
  sort: { field: string; direction: "asc" | "desc" };
  filters: Record<string, unknown>;
};

export function defaultBoardConfig(objectType: BoardObjectType): DefaultBoardConfig {
  if (objectType === "contact") {
    return {
      groupingField: "lifecycle_stage",
      lanes: CONTACT_LIFECYCLE_LANES,
      cardFields: ["name", "email", "primaryCompany", "updatedAt"],
      sort: { field: "updated_at", direction: "desc" },
      filters: {}
    };
  }
  return {
    groupingField: "lifecycle_stage",
    lanes: COMPANY_LIFECYCLE_LANES,
    cardFields: ["name", "domain", "industry", "contactCount", "updatedAt"],
    sort: { field: "updated_at", direction: "desc" },
    filters: {}
  };
}

export function encodeBoardCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ u: updatedAt.toISOString(), i: id }), "utf8").toString("base64url");
}

export function decodeBoardCursor(cursor: string): { updatedAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      u?: string;
      i?: string;
    };
    if (!parsed.u || !parsed.i) return null;
    const updatedAt = new Date(parsed.u);
    if (Number.isNaN(updatedAt.getTime())) return null;
    return { updatedAt, id: parsed.i };
  } catch {
    return null;
  }
}
