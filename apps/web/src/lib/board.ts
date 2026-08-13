export type BoardLane = {
  id: string;
  label: string;
  value: string | null;
  kind: "unassigned" | "value" | "other";
};

export type BoardObjectType = "contact" | "company";

export type BoardCard = {
  id: string;
  name: string;
  email?: string;
  domain?: string | null;
  industry?: string | null;
  primaryCompany?: { id: string; name: string } | null;
  contactCount?: number;
  lifecycleStage: string | null;
  updatedAt: string;
  version: number;
  fields?: Record<string, unknown>;
};

export const CONTACT_LANES: BoardLane[] = [
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

export const COMPANY_LANES: BoardLane[] = [
  { id: "unassigned", label: "Unassigned", value: null, kind: "unassigned" },
  { id: "prospect", label: "Prospect", value: "prospect", kind: "value" },
  { id: "qualified", label: "Qualified", value: "qualified", kind: "value" },
  { id: "customer", label: "Customer", value: "customer", kind: "value" },
  { id: "partner", label: "Partner", value: "partner", kind: "value" },
  { id: "former_customer", label: "Former Customer", value: "former_customer", kind: "value" },
  { id: "other", label: "Other", value: null, kind: "other" }
];

export function defaultLanes(objectType: BoardObjectType) {
  return objectType === "contact" ? CONTACT_LANES : COMPANY_LANES;
}

export function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
