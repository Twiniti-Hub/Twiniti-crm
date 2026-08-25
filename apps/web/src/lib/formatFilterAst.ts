type FilterLeaf = {
  op: string;
  field?: string;
  value?: unknown;
  children?: FilterLeaf[];
};

const OP_LABELS: Record<string, string> = {
  eq: "equals",
  neq: "does not equal",
  contains: "contains",
  gt: "is greater than",
  lt: "is less than",
  is_null: "is empty",
  not_null: "is not empty"
};

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  lifecycle_stage: "Lifecycle stage"
};

function formatField(field: string, propertyLabels?: Record<string, string>) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  if (field.startsWith("properties.")) {
    const key = field.slice("properties.".length);
    return propertyLabels?.[key] ?? key;
  }
  return field;
}

function formatLeaf(node: FilterLeaf, propertyLabels?: Record<string, string>) {
  if (!node.field) return "";
  const field = formatField(node.field, propertyLabels);
  const op = OP_LABELS[node.op] ?? node.op;
  if (node.op === "is_null" || node.op === "not_null") return `${field} ${op}`;
  return `${field} ${op} ${String(node.value ?? "")}`;
}

export function formatFilterAst(filterAst: unknown, propertyLabels?: Record<string, string>) {
  if (!filterAst || typeof filterAst !== "object") return "—";
  const node = filterAst as FilterLeaf;
  if (node.children?.length) {
    const joiner = node.op === "or" ? " OR " : " AND ";
    return node.children.map((child) => formatLeaf(child, propertyLabels)).filter(Boolean).join(joiner) || "—";
  }
  return formatLeaf(node, propertyLabels) || "—";
}
