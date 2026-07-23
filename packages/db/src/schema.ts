import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const crmUsers = pgTable("crm_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  hexclaveSubject: varchar("hexclave_subject", { length: 255 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("viewer"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({ subjectIndex: uniqueIndex("crm_users_subject_idx").on(table.hexclaveSubject) }));

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  email: varchar("email", { length: 320 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  lifecycleStage: varchar("lifecycle_stage", { length: 80 }),
  properties: jsonb("properties").notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  emailIndex: uniqueIndex("contacts_org_email_idx").on(table.organizationId, table.email),
  searchIndex: index("contacts_org_updated_idx").on(table.organizationId, table.updatedAt)
}));

export const propertyDefinitions = pgTable("property_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  objectType: varchar("object_type", { length: 50 }).notNull(),
  internalName: varchar("internal_name", { length: 150 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  dataType: varchar("data_type", { length: 40 }).notNull(),
  options: jsonb("options").notNull().default([]),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  objectNameIndex: uniqueIndex("property_definitions_object_name_idx").on(table.organizationId, table.objectType, table.internalName)
}));

export const agentIdentities = pgTable("agent_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 100 }).notNull(),
  purpose: text("purpose").notNull(),
  scopes: jsonb("scopes").notNull().default([]),
  credentialHash: text("credential_hash"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({ nameIndex: uniqueIndex("agent_identities_org_name_idx").on(table.organizationId, table.name) }));

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  actorType: varchar("actor_type", { length: 20 }).notNull(),
  actorId: varchar("actor_id", { length: 255 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({ createdIndex: index("audit_events_org_created_idx").on(table.organizationId, table.createdAt) }));

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: varchar("kind", { length: 80 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({ queueIndex: index("jobs_queue_idx").on(table.status, table.availableAt) }));

export const schema = { organizations, crmUsers, contacts, propertyDefinitions, agentIdentities, auditEvents, jobs };

export const currentTimestamp = sql`CURRENT_TIMESTAMP`;
