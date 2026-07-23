import { and, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { contacts } from "./schema.js";

export const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    z.object({
      op: z.enum(["and", "or"]),
      children: z.array(filterNodeSchema).min(1)
    }),
    z.object({
      op: z.enum(["eq", "neq", "contains", "gt", "lt", "is_null", "not_null"]),
      field: z.string().min(1),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
    })
  ])
);

export type FilterNode =
  | { op: "and" | "or"; children: FilterNode[] }
  | { op: "eq" | "neq" | "contains" | "gt" | "lt" | "is_null" | "not_null"; field: string; value?: string | number | boolean | null };

const contactFieldMap: Record<string, typeof contacts.email | typeof contacts.firstName | typeof contacts.lastName | typeof contacts.lifecycleStage | typeof contacts.emailNormalized> = {
  email: contacts.email,
  email_normalized: contacts.emailNormalized,
  first_name: contacts.firstName,
  last_name: contacts.lastName,
  lifecycle_stage: contacts.lifecycleStage
};

function compileLeaf(node: Extract<FilterNode, { field: string }>): SQL | undefined {
  if (node.field.startsWith("properties.")) {
    const key = node.field.slice("properties.".length);
    const path = sql`properties->>${key}`;
    switch (node.op) {
      case "eq":
        return sql`${path} = ${String(node.value ?? "")}`;
      case "neq":
        return sql`${path} <> ${String(node.value ?? "")}`;
      case "contains":
        return sql`${path} ILIKE ${`%${String(node.value ?? "")}%`}`;
      case "is_null":
        return sql`${path} IS NULL`;
      case "not_null":
        return sql`${path} IS NOT NULL`;
      case "gt":
        return sql`(${path})::numeric > ${Number(node.value ?? 0)}`;
      case "lt":
        return sql`(${path})::numeric < ${Number(node.value ?? 0)}`;
      default: {
        const _exhaustive: never = node.op;
        return _exhaustive;
      }
    }
  }

  const column = contactFieldMap[node.field];
  if (!column) {
    throw new Error(`Unsupported filter field: ${node.field}`);
  }

  switch (node.op) {
    case "eq":
      return eq(column, String(node.value ?? ""));
    case "neq":
      return sql`${column} <> ${String(node.value ?? "")}`;
    case "contains":
      return ilike(column, `%${String(node.value ?? "")}%`);
    case "is_null":
      return isNull(column);
    case "not_null":
      return sql`${column} IS NOT NULL`;
    case "gt":
    case "lt":
      throw new Error(`Operator ${node.op} is not supported for field ${node.field}`);
    default: {
      const _exhaustive: never = node.op;
      return _exhaustive;
    }
  }
}

function isGroup(node: FilterNode): node is { op: "and" | "or"; children: FilterNode[] } {
  return node.op === "and" || node.op === "or";
}

export function compileFilterAst(node: FilterNode): SQL {
  if (isGroup(node)) {
    const parts = node.children.map(compileFilterAst);
    if (node.op === "and") {
      return and(...parts)!;
    }
    return or(...parts)!;
  }

  const leaf = compileLeaf(node);
  if (!leaf) {
    throw new Error("Failed to compile filter leaf");
  }
  return leaf;
}

export function parseFilterAst(input: unknown): FilterNode {
  return filterNodeSchema.parse(input);
}
