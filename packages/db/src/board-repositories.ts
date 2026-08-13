import { and, asc, count, desc, eq, gt, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  decodeBoardCursor,
  defaultBoardConfig,
  defaultCompanyLifecycleStage,
  encodeBoardCursor,
  laneValueForWrite,
  normalizeStageSlug,
  resolveLaneId,
  type BoardLaneDefinition,
  type BoardObjectType
} from "./board.js";
import type { Db } from "./client.js";
import { compileFilterAst, parseFilterAst } from "./filters.js";
import {
  companies,
  contactCompanyAssociations,
  contacts,
  propertyHistory,
  savedViews,
  viewPreferences
} from "./schema.js";
import { normalizeDomain, updateContact } from "./repositories.js";

export type ObjectChangeContext = {
  actorType?: string;
  actorId?: string;
  source?: string;
};

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

async function recordObjectChanges(
  db: Db,
  input: {
    organizationId: string;
    objectType: BoardObjectType;
    recordId: string;
    previous: Record<string, unknown>;
    next: Record<string, unknown>;
    context?: ObjectChangeContext;
  }
) {
  const keys = new Set([...Object.keys(input.previous), ...Object.keys(input.next)]);
  const changes = [...keys].filter((key) => !valuesEqual(input.previous[key], input.next[key]));
  if (!changes.length) return;
  const changeSetId = randomUUID();
  await db.insert(propertyHistory).values(changes.map((propertyName) => ({
    organizationId: input.organizationId,
    objectType: input.objectType,
    recordId: input.recordId,
    propertyName,
    oldValue: input.previous[propertyName] ?? null,
    newValue: input.next[propertyName] ?? null,
    changeSetId,
    actorType: input.context?.actorType ?? "system",
    actorId: input.context?.actorId ?? "system",
    source: input.context?.source ?? `${input.objectType}.update`
  })));
}

function flattenCoreAndProperties(
  core: Record<string, unknown>,
  properties: Record<string, unknown>
) {
  return {
    ...core,
    ...Object.fromEntries(Object.entries(properties).map(([key, value]) => [`properties.${key}`, value]))
  };
}

export async function createCompanyRecord(
  db: Db,
  input: {
    organizationId: string;
    name: string;
    domain?: string | null;
    industry?: string | null;
    lifecycleStage?: string | null;
    properties?: Record<string, unknown>;
    change?: ObjectChangeContext;
  }
) {
  const lifecycleStage = input.lifecycleStage === undefined
    ? defaultCompanyLifecycleStage()
    : (input.lifecycleStage?.trim() || null);
  const [row] = await db.insert(companies).values({
    organizationId: input.organizationId,
    name: input.name.trim(),
    domain: input.domain ?? null,
    domainNormalized: normalizeDomain(input.domain),
    industry: input.industry ?? null,
    lifecycleStage,
    properties: input.properties ?? {}
  }).returning();
  await recordObjectChanges(db, {
    organizationId: input.organizationId,
    objectType: "company",
    recordId: row.id,
    previous: {},
    next: flattenCoreAndProperties({
      name: row.name,
      domain: row.domain,
      industry: row.industry,
      lifecycleStage: row.lifecycleStage
    }, (row.properties ?? {}) as Record<string, unknown>),
    context: { ...input.change, source: input.change?.source ?? "company.create" }
  });
  return row;
}

export async function updateCompanyRecord(
  db: Db,
  organizationId: string,
  id: string,
  input: {
    name?: string;
    domain?: string | null;
    industry?: string | null;
    lifecycleStage?: string | null;
    properties?: Record<string, unknown>;
    mergeProperty?: { key: string; value: unknown };
    version?: number;
    change?: ObjectChangeContext;
  }
) {
  const existing = await db.select().from(companies).where(and(
    eq(companies.id, id),
    eq(companies.organizationId, organizationId)
  )).limit(1);
  const current = existing[0];
  if (!current) return null;
  if (input.version !== undefined && input.version !== current.version) {
    return { conflict: true as const, current };
  }

  let nextProperties = (input.properties ?? current.properties) as Record<string, unknown>;
  if (input.mergeProperty) {
    nextProperties = {
      ...((current.properties ?? {}) as Record<string, unknown>),
      [input.mergeProperty.key]: input.mergeProperty.value
    };
  }

  const updateFilters = [eq(companies.id, id), eq(companies.organizationId, organizationId)];
  if (input.version !== undefined) updateFilters.push(eq(companies.version, current.version));

  const [row] = await db.update(companies).set({
    name: input.name === undefined ? current.name : input.name.trim(),
    domain: input.domain === undefined ? current.domain : input.domain,
    domainNormalized: input.domain === undefined ? current.domainNormalized : normalizeDomain(input.domain),
    industry: input.industry === undefined ? current.industry : input.industry,
    lifecycleStage: input.lifecycleStage === undefined ? current.lifecycleStage : input.lifecycleStage,
    properties: nextProperties,
    version: current.version + 1,
    updatedAt: new Date()
  }).where(and(...updateFilters)).returning();

  if (!row) {
    const [latest] = await db.select().from(companies).where(and(
      eq(companies.id, id),
      eq(companies.organizationId, organizationId)
    )).limit(1);
    return { conflict: true as const, current: latest ?? current };
  }

  await recordObjectChanges(db, {
    organizationId,
    objectType: "company",
    recordId: row.id,
    previous: flattenCoreAndProperties({
      name: current.name,
      domain: current.domain,
      industry: current.industry,
      lifecycleStage: current.lifecycleStage
    }, (current.properties ?? {}) as Record<string, unknown>),
    next: flattenCoreAndProperties({
      name: row.name,
      domain: row.domain,
      industry: row.industry,
      lifecycleStage: row.lifecycleStage
    }, (row.properties ?? {}) as Record<string, unknown>),
    context: input.change
  });
  return { conflict: false as const, row };
}

export type BoardConfigShape = {
  groupingField: string;
  lanes: BoardLaneDefinition[];
  cardFields: string[];
  sort: { field: string; direction: "asc" | "desc" };
  filters: Record<string, unknown>;
};

function asBoardConfig(value: unknown, objectType: BoardObjectType): BoardConfigShape {
  const defaults = defaultBoardConfig(objectType);
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<BoardConfigShape>;
  return {
    groupingField: typeof raw.groupingField === "string" ? raw.groupingField : defaults.groupingField,
    lanes: Array.isArray(raw.lanes) && raw.lanes.length ? raw.lanes as BoardLaneDefinition[] : defaults.lanes,
    cardFields: Array.isArray(raw.cardFields) ? raw.cardFields.map(String) : defaults.cardFields,
    sort: raw.sort?.field
      ? { field: String(raw.sort.field), direction: raw.sort.direction === "asc" ? "asc" : "desc" }
      : defaults.sort,
    filters: raw.filters && typeof raw.filters === "object" ? raw.filters as Record<string, unknown> : {}
  };
}

export function mapSavedView(row: typeof savedViews.$inferSelect, systemDefault = false) {
  return {
    id: row.id,
    name: row.name,
    objectType: row.objectType as BoardObjectType,
    presentation: row.presentation as "board" | "list",
    visibility: row.visibility as "private" | "shared",
    boardConfig: asBoardConfig(row.boardConfig, row.objectType as BoardObjectType),
    filterAst: (row.filterAst ?? {}) as Record<string, unknown>,
    columns: (row.columns ?? []) as unknown[],
    createdBy: row.createdBy,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    systemDefault
  };
}

export function systemDefaultView(objectType: BoardObjectType) {
  const config = defaultBoardConfig(objectType);
  return {
    id: `system-${objectType}-board`,
    name: objectType === "contact" ? "Default contact board" : "Default company board",
    objectType,
    presentation: "board" as const,
    visibility: "shared" as const,
    boardConfig: config,
    filterAst: {},
    columns: [],
    createdBy: "system",
    version: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    systemDefault: true
  };
}

export async function listBoardViews(
  db: Db,
  organizationId: string,
  userId: string,
  objectType: BoardObjectType
) {
  const rows = await db.select().from(savedViews).where(and(
    eq(savedViews.organizationId, organizationId),
    eq(savedViews.objectType, objectType),
    eq(savedViews.presentation, "board"),
    or(
      and(eq(savedViews.visibility, "private"), eq(savedViews.createdBy, userId)),
      eq(savedViews.visibility, "shared")
    )!
  )).orderBy(asc(savedViews.name));
  return [systemDefaultView(objectType), ...rows.map((row) => mapSavedView(row))];
}

export async function getBoardViewForActor(
  db: Db,
  organizationId: string,
  userId: string,
  viewId: string | undefined,
  objectType: BoardObjectType
) {
  if (!viewId || viewId.startsWith("system-")) {
    return systemDefaultView(objectType);
  }
  const [row] = await db.select().from(savedViews).where(and(
    eq(savedViews.id, viewId),
    eq(savedViews.organizationId, organizationId),
    eq(savedViews.objectType, objectType)
  )).limit(1);
  if (!row) return null;
  if (row.visibility === "private" && row.createdBy !== userId) return null;
  return mapSavedView(row);
}

export async function getBoardViewByIdForActor(
  db: Db,
  organizationId: string,
  userId: string,
  viewId: string
) {
  if (viewId.startsWith("system-")) {
    const objectType = viewId.includes("company") ? "company" : "contact";
    return systemDefaultView(objectType);
  }
  const [row] = await db.select().from(savedViews).where(and(
    eq(savedViews.id, viewId),
    eq(savedViews.organizationId, organizationId)
  )).limit(1);
  if (!row) return null;
  if (row.visibility === "private" && row.createdBy !== userId) return null;
  return mapSavedView(row);
}

export async function createBoardView(
  db: Db,
  input: {
    organizationId: string;
    userId: string;
    name: string;
    objectType: BoardObjectType;
    presentation?: "board" | "list";
    visibility: "private" | "shared";
    boardConfig: BoardConfigShape;
    filterAst?: Record<string, unknown>;
    columns?: unknown[];
  }
) {
  const [row] = await db.insert(savedViews).values({
    organizationId: input.organizationId,
    name: input.name,
    objectType: input.objectType,
    presentation: input.presentation ?? "board",
    visibility: input.visibility,
    boardConfig: input.boardConfig,
    filterAst: input.filterAst ?? {},
    columns: input.columns ?? [],
    createdBy: input.userId
  }).returning();
  return mapSavedView(row);
}

export async function updateBoardView(
  db: Db,
  organizationId: string,
  viewId: string,
  input: {
    name?: string;
    visibility?: "private" | "shared";
    boardConfig?: BoardConfigShape;
    filterAst?: Record<string, unknown>;
    columns?: unknown[];
    version?: number;
  }
) {
  const [current] = await db.select().from(savedViews).where(and(
    eq(savedViews.id, viewId),
    eq(savedViews.organizationId, organizationId)
  )).limit(1);
  if (!current) return null;
  if (input.version !== undefined && input.version !== current.version) {
    return { conflict: true as const, current: mapSavedView(current) };
  }
  const filters = [eq(savedViews.id, viewId), eq(savedViews.organizationId, organizationId)];
  if (input.version !== undefined) filters.push(eq(savedViews.version, current.version));
  const [row] = await db.update(savedViews).set({
    name: input.name ?? current.name,
    visibility: input.visibility ?? current.visibility,
    boardConfig: input.boardConfig ?? current.boardConfig,
    filterAst: input.filterAst ?? current.filterAst,
    columns: input.columns ?? current.columns,
    version: current.version + 1,
    updatedAt: new Date()
  }).where(and(...filters)).returning();
  if (!row) return { conflict: true as const, current: mapSavedView(current) };
  return { conflict: false as const, view: mapSavedView(row) };
}

export async function deleteBoardView(db: Db, organizationId: string, viewId: string) {
  const [row] = await db.delete(savedViews).where(and(
    eq(savedViews.id, viewId),
    eq(savedViews.organizationId, organizationId)
  )).returning();
  return row ?? null;
}

export async function getViewPreference(
  db: Db,
  organizationId: string,
  userId: string,
  objectType: BoardObjectType,
  presentation: "board" | "list" = "board"
) {
  const [row] = await db.select().from(viewPreferences).where(and(
    eq(viewPreferences.organizationId, organizationId),
    eq(viewPreferences.userId, userId),
    eq(viewPreferences.objectType, objectType),
    eq(viewPreferences.presentation, presentation)
  )).limit(1);
  return row ?? null;
}

export async function setViewPreference(
  db: Db,
  input: {
    organizationId: string;
    userId: string;
    objectType: BoardObjectType;
    presentation: "board" | "list";
    viewId: string | null;
  }
) {
  const existing = await getViewPreference(
    db,
    input.organizationId,
    input.userId,
    input.objectType,
    input.presentation
  );
  if (existing) {
    const [row] = await db.update(viewPreferences).set({
      viewId: input.viewId,
      updatedAt: new Date()
    }).where(eq(viewPreferences.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(viewPreferences).values({
    organizationId: input.organizationId,
    userId: input.userId,
    objectType: input.objectType,
    presentation: input.presentation,
    viewId: input.viewId
  }).returning();
  return row;
}

function groupingSql(objectType: BoardObjectType, groupingField: string) {
  if (groupingField === "lifecycle_stage") {
    return objectType === "contact" ? contacts.lifecycleStage : companies.lifecycleStage;
  }
  if (groupingField.startsWith("properties.")) {
    const key = groupingField.slice("properties.".length);
    return sql`properties->>${key}`;
  }
  if (objectType === "company" && groupingField === "industry") {
    return companies.industry;
  }
  return objectType === "contact" ? contacts.lifecycleStage : companies.lifecycleStage;
}

function laneMatchSql(
  objectType: BoardObjectType,
  groupingField: string,
  lane: BoardLaneDefinition,
  lanes: BoardLaneDefinition[]
) {
  const column = groupingSql(objectType, groupingField);
  const known = lanes
    .filter((item) => item.kind === "value" && item.value)
    .map((item) => item.value!.toLowerCase());

  if (lane.kind === "unassigned") {
    return or(isNull(column as never), sql`btrim(coalesce(${column}::text, '')) = ''`)!;
  }
  if (lane.kind === "value" && lane.value) {
    return sql`lower(btrim(coalesce(${column}::text, ''))) = ${lane.value.toLowerCase()}`;
  }
  // Other: non-empty and not in known slugs
  if (!known.length) {
    return sql`btrim(coalesce(${column}::text, '')) <> ''`;
  }
  return and(
    sql`btrim(coalesce(${column}::text, '')) <> ''`,
    sql`lower(btrim(coalesce(${column}::text, ''))) not in (${sql.join(known.map((value) => sql`${value}`), sql`, `)})`
  )!;
}

function contactSearchFilters(organizationId: string, query?: string): SQL[] {
  const filters: SQL[] = [
    eq(contacts.organizationId, organizationId),
    isNull(contacts.archivedAt),
    isNull(contacts.mergedIntoContactId)
  ];
  if (query?.trim()) {
    const q = `%${query.trim()}%`;
    filters.push(or(
      ilike(contacts.email, q),
      ilike(contacts.phone, q),
      ilike(contacts.firstName, q),
      ilike(contacts.lastName, q)
    )!);
  }
  return filters;
}

function companySearchFilters(organizationId: string, query?: string): SQL[] {
  const filters: SQL[] = [
    eq(companies.organizationId, organizationId),
    isNull(companies.archivedAt)
  ];
  if (query?.trim()) {
    const q = `%${query.trim()}%`;
    filters.push(or(ilike(companies.name, q), ilike(companies.domain, q))!);
  }
  return filters;
}

export async function countBoardLanes(
  db: Db,
  organizationId: string,
  objectType: BoardObjectType,
  boardConfig: BoardConfigShape,
  query?: string
) {
  const results: { laneId: string; count: number }[] = [];
  for (const lane of boardConfig.lanes) {
    const laneFilter = laneMatchSql(objectType, boardConfig.groupingField, lane, boardConfig.lanes);
    if (objectType === "contact") {
      const filters = [...contactSearchFilters(organizationId, query), laneFilter];
      if (boardConfig.filters && Object.keys(boardConfig.filters).length) {
        try {
          filters.push(compileFilterAst(parseFilterAst(boardConfig.filters), "contact"));
        } catch {
          // ignore invalid stored filters
        }
      }
      const rows = await db.select({ value: count() }).from(contacts).where(and(...filters));
      results.push({ laneId: lane.id, count: Number(rows[0]?.value ?? 0) });
    } else {
      const filters = [...companySearchFilters(organizationId, query), laneFilter];
      if (boardConfig.filters && Object.keys(boardConfig.filters).length) {
        try {
          filters.push(compileFilterAst(parseFilterAst(boardConfig.filters), "company"));
        } catch {
          // ignore invalid stored filters
        }
      }
      const rows = await db.select({ value: count() }).from(companies).where(and(...filters));
      results.push({ laneId: lane.id, count: Number(rows[0]?.value ?? 0) });
    }
  }
  return results;
}

export async function listBoardCards(
  db: Db,
  organizationId: string,
  objectType: BoardObjectType,
  boardConfig: BoardConfigShape,
  options: { laneId: string; query?: string; limit?: number; cursor?: string }
) {
  const lane = boardConfig.lanes.find((item) => item.id === options.laneId);
  if (!lane) return { data: [] as unknown[], nextCursor: null as string | null };
  const limit = options.limit ?? 25;
  const cursor = options.cursor ? decodeBoardCursor(options.cursor) : null;
  const sortDesc = boardConfig.sort.direction !== "asc";

  if (objectType === "contact") {
    const filters: SQL[] = [
      ...contactSearchFilters(organizationId, options.query),
      laneMatchSql("contact", boardConfig.groupingField, lane, boardConfig.lanes)
    ];
    if (cursor) {
      filters.push(
        sortDesc
          ? or(
            lt(contacts.updatedAt, cursor.updatedAt),
            and(eq(contacts.updatedAt, cursor.updatedAt), lt(contacts.id, cursor.id))!
          )!
          : or(
            gt(contacts.updatedAt, cursor.updatedAt),
            and(eq(contacts.updatedAt, cursor.updatedAt), gt(contacts.id, cursor.id))!
          )!
      );
    }
    const rows = await db.select({
      id: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      lifecycleStage: contacts.lifecycleStage,
      properties: contacts.properties,
      version: contacts.version,
      updatedAt: contacts.updatedAt,
      companyId: contactCompanyAssociations.companyId,
      companyName: companies.name
    }).from(contacts)
      .leftJoin(contactCompanyAssociations, and(
        eq(contactCompanyAssociations.contactId, contacts.id),
        eq(contactCompanyAssociations.organizationId, organizationId),
        eq(contactCompanyAssociations.label, "primary")
      ))
      .leftJoin(companies, and(
        eq(companies.id, contactCompanyAssociations.companyId),
        eq(companies.organizationId, organizationId),
        isNull(companies.archivedAt)
      ))
      .where(and(...filters))
      .orderBy(sortDesc ? desc(contacts.updatedAt) : asc(contacts.updatedAt), sortDesc ? desc(contacts.id) : asc(contacts.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const next = rows.length > limit ? rows[limit] : null;
    return {
      data: page.map((row) => {
        const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email;
        return {
          id: row.id,
          name,
          email: row.email,
          primaryCompany: row.companyId && row.companyName ? { id: row.companyId, name: row.companyName } : null,
          lifecycleStage: row.lifecycleStage,
          updatedAt: row.updatedAt.toISOString(),
          version: row.version,
          fields: {
            ...(row.properties as Record<string, unknown>),
            laneId: resolveLaneId(boardConfig.lanes, row.lifecycleStage)
          }
        };
      }),
      nextCursor: next ? encodeBoardCursor(next.updatedAt, next.id) : null
    };
  }

  const filters: SQL[] = [
    ...companySearchFilters(organizationId, options.query),
    laneMatchSql("company", boardConfig.groupingField, lane, boardConfig.lanes)
  ];
  if (cursor) {
    filters.push(
      sortDesc
        ? or(
          lt(companies.updatedAt, cursor.updatedAt),
          and(eq(companies.updatedAt, cursor.updatedAt), lt(companies.id, cursor.id))!
        )!
        : or(
          gt(companies.updatedAt, cursor.updatedAt),
          and(eq(companies.updatedAt, cursor.updatedAt), gt(companies.id, cursor.id))!
        )!
    );
  }
  const rows = await db.select({
    id: companies.id,
    name: companies.name,
    domain: companies.domain,
    industry: companies.industry,
    lifecycleStage: companies.lifecycleStage,
    properties: companies.properties,
    version: companies.version,
    updatedAt: companies.updatedAt,
    contactCount: sql<number>`(
      select count(*)::int from ${contactCompanyAssociations}
      inner join ${contacts} on ${contacts.id} = ${contactCompanyAssociations.contactId}
      where ${contactCompanyAssociations.companyId} = ${companies.id}
        and ${contactCompanyAssociations.organizationId} = ${organizationId}
        and ${contacts.organizationId} = ${organizationId}
        and ${contacts.archivedAt} is null
        and ${contacts.mergedIntoContactId} is null
    )`
  }).from(companies)
    .where(and(...filters))
    .orderBy(sortDesc ? desc(companies.updatedAt) : asc(companies.updatedAt), sortDesc ? desc(companies.id) : asc(companies.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const next = rows.length > limit ? rows[limit] : null;
  return {
    data: page.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      industry: row.industry,
      contactCount: Number(row.contactCount ?? 0),
      lifecycleStage: row.lifecycleStage,
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
      fields: {
        ...(row.properties as Record<string, unknown>),
        laneId: resolveLaneId(boardConfig.lanes, row.lifecycleStage)
      }
    })),
    nextCursor: next ? encodeBoardCursor(next.updatedAt, next.id) : null
  };
}

export async function moveBoardRecord(
  db: Db,
  organizationId: string,
  input: {
    objectType: BoardObjectType;
    recordId: string;
    laneId: string;
    version: number;
    boardConfig: BoardConfigShape;
    change?: ObjectChangeContext;
  }
) {
  const write = laneValueForWrite(input.boardConfig.lanes, input.laneId);
  if (!write.ok) return { error: write.error as string };

  const groupingField = input.boardConfig.groupingField;
  const isProperty = groupingField.startsWith("properties.");
  const propertyKey = isProperty ? groupingField.slice("properties.".length) : null;

  if (input.objectType === "contact") {
    if (groupingField === "lifecycle_stage") {
      return updateContact(db, organizationId, input.recordId, {
        lifecycleStage: write.value,
        version: input.version,
        change: input.change
      });
    }
    if (propertyKey) {
      const current = await db.select().from(contacts).where(and(
        eq(contacts.id, input.recordId),
        eq(contacts.organizationId, organizationId)
      )).limit(1);
      const row = current[0];
      if (!row) return null;
      const merged = {
        ...((row.properties ?? {}) as Record<string, unknown>),
        [propertyKey]: write.value
      };
      return updateContact(db, organizationId, input.recordId, {
        properties: merged,
        version: input.version,
        change: input.change
      });
    }
    return { error: `Unsupported contact grouping field: ${groupingField}` };
  }

  if (groupingField === "lifecycle_stage" || groupingField === "industry") {
    return updateCompanyRecord(db, organizationId, input.recordId, {
      ...(groupingField === "lifecycle_stage"
        ? { lifecycleStage: write.value }
        : { industry: write.value }),
      version: input.version,
      change: input.change
    });
  }
  if (propertyKey) {
    return updateCompanyRecord(db, organizationId, input.recordId, {
      mergeProperty: { key: propertyKey, value: write.value },
      version: input.version,
      change: input.change
    });
  }
  return { error: `Unsupported company grouping field: ${groupingField}` };
}

export { normalizeStageSlug, resolveLaneId, laneValueForWrite };
