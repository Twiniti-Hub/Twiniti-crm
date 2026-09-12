import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  residencyRegion: varchar("residency_region", { length: 2 }).notNull().default("us"),
  routingPolicyVersion: varchar("routing_policy_version", { length: 40 }).notNull().default("country-v1"),
  provisioningKey: varchar("provisioning_key", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  provisioningKeyIndex: uniqueIndex("organizations_provisioning_key_idx").on(table.provisioningKey)
}));

export const organizationBilling = pgTable("organization_billing", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  stripeSubscriptionStatus: varchar("stripe_subscription_status", { length: 32 }),
  trialKind: varchar("trial_kind", { length: 32 }).notNull().default("none"),
  trialStart: timestamp("trial_start", { withTimezone: true }),
  trialEnd: timestamp("trial_end", { withTimezone: true }),
  stripePromotionCodeId: varchar("stripe_promotion_code_id", { length: 255 }),
  stripeCouponId: varchar("stripe_coupon_id", { length: 255 }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  lastStripeEventCreatedAt: timestamp("last_stripe_event_created_at", { withTimezone: true }),
  licenseProvisioningStatus: varchar("license_provisioning_status", { length: 32 }).notNull().default("pending"),
  licenseOrganizationId: varchar("license_organization_id", { length: 255 }),
  licenseId: varchar("license_id", { length: 255 }),
  licenseUserId: varchar("license_user_id", { length: 255 }),
  licenseDecision: varchar("license_decision", { length: 32 }),
  licenseStatus: varchar("license_status", { length: 32 }),
  licenseReasonCode: varchar("license_reason_code", { length: 80 }),
  licenseExpiresAt: timestamp("license_expires_at", { withTimezone: true }),
  licenseGraceCutoff: timestamp("license_grace_cutoff", { withTimezone: true }),
  lastLicenseCheckedAt: timestamp("last_license_checked_at", { withTimezone: true }),
  lastLicenseSyncAt: timestamp("last_license_sync_at", { withTimezone: true }),
  trialConvertedAt: timestamp("trial_converted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  organizationIndex: uniqueIndex("organization_billing_org_idx").on(table.organizationId),
  customerIndex: uniqueIndex("organization_billing_customer_idx").on(table.stripeCustomerId),
  subscriptionIndex: uniqueIndex("organization_billing_subscription_idx").on(table.stripeSubscriptionId),
  checkoutIndex: uniqueIndex("organization_billing_checkout_idx").on(table.stripeCheckoutSessionId)
}));

export const organizationResendDomains = pgTable("organization_resend_domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  domain: varchar("domain", { length: 255 }).notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  webhookSecretCiphertext: text("webhook_secret_ciphertext"),
  resendDomainId: varchar("resend_domain_id", { length: 255 }),
  fromEmail: varchar("from_email", { length: 320 }).notNull(),
  fromName: varchar("from_name", { length: 200 }),
  verificationStatus: varchar("verification_status", { length: 32 }).notNull().default("unverified"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  organizationDomainIndex: uniqueIndex("organization_resend_domains_org_domain_idx").on(table.organizationId, table.domain),
  organizationIndex: index("organization_resend_domains_org_idx").on(table.organizationId),
  defaultIndex: uniqueIndex("organization_resend_domains_default_idx").on(table.organizationId).where(sql`${table.isDefault} = true AND ${table.active} = true`)
}));

export const stripeEvents = pgTable("stripe_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
}, (table) => ({
  stripeEventIndex: uniqueIndex("stripe_events_event_idx").on(table.stripeEventId)
}));

export const crmUsers = pgTable("crm_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  hexclaveSubject: varchar("hexclave_subject", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  displayName: varchar("display_name", { length: 200 }),
  countryCode: varchar("country_code", { length: 2 }),
  role: varchar("role", { length: 32 }).notNull().default("member"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  subjectIndex: uniqueIndex("crm_users_subject_idx").on(table.hexclaveSubject)
}));

export const organizationInvitations = pgTable("organization_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  email: varchar("email", { length: 320 }).notNull(),
  emailNormalized: varchar("email_normalized", { length: 320 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("member"),
  token: varchar("token", { length: 64 }).notNull(),
  invitedByUserId: uuid("invited_by_user_id").references(() => crmUsers.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  tokenIndex: uniqueIndex("organization_invitations_token_idx").on(table.token),
  pendingEmailIndex: uniqueIndex("organization_invitations_org_email_pending_idx")
    .on(table.organizationId, table.emailNormalized)
    .where(sql`${table.acceptedAt} is null`)
}));

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  email: varchar("email", { length: 320 }).notNull(),
  emailNormalized: varchar("email_normalized", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 80 }),
  phoneNormalized: varchar("phone_normalized", { length: 40 }),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  lifecycleStage: varchar("lifecycle_stage", { length: 80 }),
  properties: jsonb("properties").notNull().default({}),
  version: integer("version").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  mergedIntoContactId: uuid("merged_into_contact_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  emailIndex: uniqueIndex("contacts_org_email_idx").on(table.organizationId, table.emailNormalized),
  searchIndex: index("contacts_org_updated_idx").on(table.organizationId, table.updatedAt),
  lifecycleBoardIndex: index("contacts_org_lifecycle_updated_idx").on(
    table.organizationId,
    table.lifecycleStage,
    table.updatedAt,
    table.id
  )
}));

export const contactIdentities = pgTable("contact_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  identityType: varchar("identity_type", { length: 40 }).notNull(),
  provider: varchar("provider", { length: 80 }).notNull().default("crm"),
  normalizedValue: varchar("normalized_value", { length: 500 }).notNull(),
  displayValue: varchar("display_value", { length: 500 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  source: varchar("source", { length: 80 }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default({})
}, (table) => ({
  activeIdentityIndex: uniqueIndex("contact_identities_active_value_idx")
    .on(table.organizationId, table.identityType, table.provider, table.normalizedValue)
    .where(sql`${table.endedAt} IS NULL`),
  contactIndex: index("contact_identities_contact_idx").on(table.organizationId, table.contactId, table.identityType),
  lookupIndex: index("contact_identities_lookup_idx").on(table.organizationId, table.normalizedValue)
}));

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 200 }).notNull(),
  domain: varchar("domain", { length: 255 }),
  domainNormalized: varchar("domain_normalized", { length: 255 }),
  industry: varchar("industry", { length: 120 }),
  lifecycleStage: varchar("lifecycle_stage", { length: 80 }),
  properties: jsonb("properties").notNull().default({}),
  version: integer("version").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  domainIndex: uniqueIndex("companies_org_domain_idx").on(table.organizationId, table.domainNormalized),
  nameIndex: index("companies_org_name_idx").on(table.organizationId, table.name),
  lifecycleBoardIndex: index("companies_org_lifecycle_updated_idx").on(
    table.organizationId,
    table.lifecycleStage,
    table.updatedAt,
    table.id
  )
}));

export const contactCompanyAssociations = pgTable("contact_company_associations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  label: varchar("label", { length: 80 }).default("primary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  pairIndex: uniqueIndex("contact_company_pair_idx").on(table.contactId, table.companyId)
}));

export const propertyDefinitions = pgTable("property_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  objectType: varchar("object_type", { length: 50 }).notNull(),
  internalName: varchar("internal_name", { length: 150 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  dataType: varchar("data_type", { length: 40 }).notNull(),
  fieldGroup: varchar("field_group", { length: 100 }),
  options: jsonb("options").notNull().default([]),
  required: boolean("required").notNull().default(false),
  searchable: boolean("searchable").notNull().default(false),
  hubspotMetadata: jsonb("hubspot_metadata").default({}),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  objectNameIndex: uniqueIndex("property_definitions_object_name_idx").on(
    table.organizationId,
    table.objectType,
    table.internalName
  )
}));

export const propertyHistory = pgTable("property_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  objectType: varchar("object_type", { length: 50 }).notNull(),
  recordId: uuid("record_id").notNull(),
  propertyName: varchar("property_name", { length: 150 }).notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  changeSetId: uuid("change_set_id"),
  actorType: varchar("actor_type", { length: 20 }).notNull(),
  actorId: varchar("actor_id", { length: 255 }).notNull(),
  source: varchar("source", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  recordIndex: index("property_history_record_idx").on(table.organizationId, table.objectType, table.recordId),
  changeSetIndex: index("property_history_change_set_idx").on(table.organizationId, table.changeSetId)
}));

export const externalRecordIds = pgTable("external_record_ids", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  provider: varchar("provider", { length: 50 }).notNull(),
  objectType: varchar("object_type", { length: 50 }).notNull(),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  internalId: uuid("internal_id").notNull(),
  rawPayload: jsonb("raw_payload").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  mappingIndex: uniqueIndex("external_record_mapping_idx").on(
    table.organizationId,
    table.provider,
    table.objectType,
    table.externalId
  )
}));

export const subscriptionTypes = pgTable("subscription_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const contactSubscriptions = pgTable("contact_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  subscriptionTypeId: uuid("subscription_type_id").notNull().references(() => subscriptionTypes.id),
  status: varchar("status", { length: 40 }).notNull().default("subscribed"),
  source: varchar("source", { length: 80 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  contactSubIndex: uniqueIndex("contact_subscription_idx").on(table.contactId, table.subscriptionTypeId)
}));

export const suppressionEntries = pgTable("suppression_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  emailNormalized: varchar("email_normalized", { length: 320 }).notNull(),
  reason: varchar("reason", { length: 120 }).notNull(),
  source: varchar("source", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  emailIndex: uniqueIndex("suppression_email_idx").on(table.organizationId, table.emailNormalized)
}));

export const customerEvents = pgTable("customer_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  source: varchar("source", { length: 80 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  dedupeKey: varchar("dedupe_key", { length: 255 }),
  privacyClass: varchar("privacy_class", { length: 40 }).default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  contactIndex: index("customer_events_contact_idx").on(table.organizationId, table.contactId, table.occurredAt),
  dedupeIndex: uniqueIndex("customer_events_dedupe_idx").on(table.organizationId, table.dedupeKey)
}));

export const emailTrackingAddresses = pgTable("email_tracking_addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => crmUsers.id),
  token: varchar("token", { length: 128 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  tokenIndex: uniqueIndex("email_tracking_addresses_token_idx").on(table.token),
  userIndex: uniqueIndex("email_tracking_addresses_org_user_idx").on(table.organizationId, table.userId)
}));

export const lists = pgTable("lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  listType: varchar("list_type", { length: 20 }).notNull().default("static"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const listMemberships = pgTable("list_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  listId: uuid("list_id").notNull().references(() => lists.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  memberIndex: uniqueIndex("list_membership_idx").on(table.listId, table.contactId)
}));

export const segments = pgTable("segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  filterAst: jsonb("filter_ast").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const forms = pgTable("forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull(),
  fields: jsonb("fields").notNull().default([]),
  settings: jsonb("settings").notNull().default({}),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  slugIndex: uniqueIndex("forms_org_slug_idx").on(table.organizationId, table.slug)
}));

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  formId: uuid("form_id").notNull().references(() => forms.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  payload: jsonb("payload").notNull().default({}),
  ipHash: varchar("ip_hash", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  subject: varchar("subject", { length: 300 }).notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body"),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  templateId: uuid("template_id").references(() => emailTemplates.id),
  segmentId: uuid("segment_id").references(() => segments.id),
  listId: uuid("list_id").references(() => lists.id),
  subject: varchar("subject", { length: 300 }),
  htmlBody: text("html_body"),
  contentHash: varchar("content_hash", { length: 128 }),
  recipientCount: integer("recipient_count").default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdByType: varchar("created_by_type", { length: 20 }).notNull().default("user"),
  createdById: varchar("created_by_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const campaignApprovals = pgTable("campaign_approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  agentId: uuid("agent_id"),
  requestedBy: varchar("requested_by", { length: 255 }).notNull(),
  approvedBy: varchar("approved_by", { length: 255 }),
  status: varchar("status", { length: 40 }).notNull().default("pending"),
  recipientCount: integer("recipient_count").notNull().default(0),
  contentHash: varchar("content_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const campaignRecipients = pgTable("campaign_recipients", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  emailNormalized: varchar("email_normalized", { length: 320 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("pending"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  resendId: varchar("resend_id", { length: 255 }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  idempotencyIndex: uniqueIndex("campaign_recipient_idempotency_idx").on(table.idempotencyKey),
  campaignContactIndex: uniqueIndex("campaign_recipient_contact_idx").on(table.campaignId, table.contactId)
}));

export const emailSends = pgTable("email_sends", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  resendId: varchar("resend_id", { length: 255 }),
  toEmail: varchar("to_email", { length: 320 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("queued"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  sendIdempotencyIndex: uniqueIndex("email_sends_idempotency_idx").on(table.idempotencyKey)
}));

export const emailEvents = pgTable("email_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  resendId: varchar("resend_id", { length: 255 }),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  email: varchar("email", { length: 320 }),
  payload: jsonb("payload").notNull().default({}),
  dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  dedupeIndex: uniqueIndex("email_events_dedupe_idx").on(table.organizationId, table.dedupeKey)
}));

export const emailActivities = pgTable("email_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  trackingAddressId: uuid("tracking_address_id").references(() => emailTrackingAddresses.id),
  direction: varchar("direction", { length: 20 }).notNull(),
  activityType: varchar("activity_type", { length: 40 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull().default("resend"),
  providerEmailId: varchar("provider_email_id", { length: 255 }),
  fromEmail: varchar("from_email", { length: 320 }),
  toEmails: jsonb("to_emails").notNull().default([]),
  ccEmails: jsonb("cc_emails").notNull().default([]),
  bccEmails: jsonb("bcc_emails").notNull().default([]),
  subject: varchar("subject", { length: 500 }),
  messageId: varchar("message_id", { length: 500 }),
  inReplyTo: varchar("in_reply_to", { length: 500 }),
  threadKey: varchar("thread_key", { length: 500 }),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  metadata: jsonb("metadata").notNull().default({}),
  dedupeKey: varchar("dedupe_key", { length: 500 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  contactIndex: index("email_activities_contact_idx").on(table.organizationId, table.contactId, table.occurredAt),
  dedupeIndex: uniqueIndex("email_activities_dedupe_idx").on(table.organizationId, table.dedupeKey),
  providerIndex: index("email_activities_provider_idx").on(table.organizationId, table.providerEmailId)
}));

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  provider: varchar("provider", { length: 50 }).notNull(),
  eventType: varchar("event_type", { length: 120 }),
  payload: jsonb("payload").notNull(),
  signatureValid: boolean("signature_valid").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const agentIdentities = pgTable("agent_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 100 }).notNull(),
  purpose: text("purpose").notNull(),
  scopes: jsonb("scopes").notNull().default([]),
  credentialHash: text("credential_hash"),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  nameIndex: uniqueIndex("agent_identities_org_name_idx").on(table.organizationId, table.name)
}));

export const workerInstructionVersions = pgTable("worker_instruction_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  version: integer("version").notNull(),
  instructions: text("instructions").notNull(),
  inputSchema: jsonb("input_schema").notNull().default({}),
  outputSchema: jsonb("output_schema").notNull().default({}),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  versionIndex: uniqueIndex("worker_instruction_versions_org_version_idx").on(table.organizationId, table.version)
}));

export const workerPolicySets = pgTable("worker_policy_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 120 }).notNull(),
  version: integer("version").notNull(),
  policy: jsonb("policy").notNull().default({}),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  versionIndex: uniqueIndex("worker_policy_sets_org_name_version_idx").on(table.organizationId, table.name, table.version)
}));

export const modelProfiles = pgTable("model_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 120 }).notNull(),
  providerAlias: varchar("provider_alias", { length: 120 }).notNull(),
  capabilities: jsonb("capabilities").notNull().default([]),
  settings: jsonb("settings").notNull().default({}),
  status: varchar("status", { length: 40 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  nameIndex: uniqueIndex("model_profiles_org_name_idx").on(table.organizationId, table.name)
}));

export const digitalWorkers = pgTable("digital_workers", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  description: text("description").notNull().default(""),
  role: varchar("role", { length: 80 }).notNull(),
  ownerUserId: uuid("owner_user_id").references(() => crmUsers.id),
  agentIdentityId: uuid("agent_identity_id").references(() => agentIdentities.id),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  autonomyLevel: varchar("autonomy_level", { length: 40 }).notNull().default("observe"),
  instructionVersionId: uuid("instruction_version_id").references(() => workerInstructionVersions.id),
  policySetId: uuid("policy_set_id").references(() => workerPolicySets.id),
  modelProfileId: uuid("model_profile_id").references(() => modelProfiles.id),
  defaultBudget: jsonb("default_budget").notNull().default({}),
  featureKey: varchar("feature_key", { length: 120 }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  slugIndex: uniqueIndex("digital_workers_org_slug_idx").on(table.organizationId, table.slug),
  statusIndex: index("digital_workers_org_status_idx").on(table.organizationId, table.status)
}));

export const workerToolGrants = pgTable("worker_tool_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workerId: uuid("worker_id").notNull().references(() => digitalWorkers.id),
  toolName: varchar("tool_name", { length: 120 }).notNull(),
  toolVersion: varchar("tool_version", { length: 40 }).notNull(),
  constraints: jsonb("constraints").notNull().default({}),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  grantIndex: uniqueIndex("worker_tool_grants_org_worker_tool_version_idx").on(table.organizationId, table.workerId, table.toolName, table.toolVersion)
}));

export const workerTools = pgTable("worker_tools", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 120 }).notNull(),
  version: varchar("version", { length: 40 }).notNull(),
  adapter: varchar("adapter", { length: 40 }).notNull(),
  inputSchema: jsonb("input_schema").notNull().default({}),
  outputSchema: jsonb("output_schema").notNull().default({}),
  requiredScopes: jsonb("required_scopes").notNull().default([]),
  riskTier: varchar("risk_tier", { length: 40 }).notNull().default("read"),
  sideEffectClass: varchar("side_effect_class", { length: 40 }).notNull().default("none"),
  status: varchar("status", { length: 40 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  toolIndex: uniqueIndex("worker_tools_org_name_version_idx").on(table.organizationId, table.name, table.version)
}));

export const workerMissions = pgTable("worker_missions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workerId: uuid("worker_id").notNull().references(() => digitalWorkers.id),
  goal: text("goal").notNull(),
  input: jsonb("input").notNull().default({}),
  successCriteria: jsonb("success_criteria").notNull().default([]),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  priority: integer("priority").notNull().default(100),
  budget: jsonb("budget").notNull().default({}),
  requestedBy: varchar("requested_by", { length: 255 }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  queueIndex: index("worker_missions_org_status_priority_idx").on(table.organizationId, table.status, table.priority),
  workerIndex: index("worker_missions_org_worker_idx").on(table.organizationId, table.workerId)
}));

export const workerRuns = pgTable("worker_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  missionId: uuid("mission_id").notNull().references(() => workerMissions.id),
  attempt: integer("attempt").notNull().default(1),
  trigger: varchar("trigger", { length: 80 }).notNull().default("manual"),
  inputSnapshot: jsonb("input_snapshot").notNull().default({}),
  inputHash: varchar("input_hash", { length: 128 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("queued"),
  currentStep: integer("current_step").notNull().default(0),
  leaseToken: varchar("lease_token", { length: 128 }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  usage: jsonb("usage").notNull().default({}),
  terminalReason: text("terminal_reason"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  statusIndex: index("worker_runs_org_status_created_idx").on(table.organizationId, table.status, table.createdAt),
  missionAttemptIndex: uniqueIndex("worker_runs_mission_attempt_idx").on(table.missionId, table.attempt)
}));

export const workerRunCredentials = pgTable("worker_run_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  runId: uuid("run_id").notNull().references(() => workerRuns.id),
  workerId: uuid("worker_id").notNull().references(() => digitalWorkers.id),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  audience: varchar("audience", { length: 160 }).notNull(),
  scopes: jsonb("scopes").notNull().default([]),
  allowedTools: jsonb("allowed_tools").notNull().default([]),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true })
}, (table) => ({
  tokenIndex: uniqueIndex("worker_run_credentials_org_token_idx").on(table.organizationId, table.tokenHash),
  runIndex: index("worker_run_credentials_org_run_expiry_idx").on(table.organizationId, table.runId, table.expiresAt)
}));

export const workerRunSteps = pgTable("worker_run_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  runId: uuid("run_id").notNull().references(() => workerRuns.id),
  sequence: integer("sequence").notNull(),
  type: varchar("type", { length: 40 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("pending"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  input: jsonb("input").notNull().default({}),
  output: jsonb("output").notNull().default({}),
  errorCode: varchar("error_code", { length: 80 }),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  sequenceIndex: uniqueIndex("worker_run_steps_run_sequence_idx").on(table.runId, table.sequence),
  idempotencyIndex: uniqueIndex("worker_run_steps_org_idempotency_idx").on(table.organizationId, table.idempotencyKey)
}));

export const actionProposals = pgTable("action_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  runId: uuid("run_id").references(() => workerRuns.id),
  stepId: uuid("step_id").references(() => workerRunSteps.id),
  actionType: varchar("action_type", { length: 120 }).notNull(),
  target: jsonb("target").notNull().default({}),
  payload: jsonb("payload").notNull().default({}),
  contentHash: varchar("content_hash", { length: 128 }).notNull(),
  riskTier: varchar("risk_tier", { length: 40 }).notNull(),
  rationale: text("rationale").notNull().default(""),
  evidence: jsonb("evidence").notNull().default([]),
  policyDecision: jsonb("policy_decision").notNull().default({}),
  status: varchar("status", { length: 40 }).notNull().default("proposed"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  statusIndex: index("action_proposals_org_status_expiry_idx").on(table.organizationId, table.status, table.expiresAt),
  hashIndex: index("action_proposals_org_hash_idx").on(table.organizationId, table.contentHash)
}));

export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  proposalId: uuid("proposal_id").notNull().references(() => actionProposals.id),
  decision: varchar("decision", { length: 40 }).notNull(),
  actorId: varchar("actor_id", { length: 255 }).notNull(),
  rationale: text("rationale").notNull().default(""),
  proposalHash: varchar("proposal_hash", { length: 128 }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  proposalIndex: uniqueIndex("approvals_org_proposal_idx").on(table.organizationId, table.proposalId)
}));

export const aiEntitlements = pgTable("ai_entitlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  featureKey: varchar("feature_key", { length: 120 }).notNull(),
  decision: varchar("decision", { length: 40 }).notNull(),
  reasonCode: varchar("reason_code", { length: 120 }).notNull(),
  sourceRef: varchar("source_ref", { length: 255 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  lookupIndex: uniqueIndex("ai_entitlements_org_feature_idx").on(table.organizationId, table.featureKey)
}));

export const aiUsageLedger = pgTable("ai_usage_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workerId: uuid("worker_id").references(() => digitalWorkers.id),
  missionId: uuid("mission_id").references(() => workerMissions.id),
  runId: uuid("run_id").references(() => workerRuns.id),
  stepId: uuid("step_id").references(() => workerRunSteps.id),
  providerAlias: varchar("provider_alias", { length: 120 }).notNull(),
  model: varchar("model", { length: 160 }).notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
  settledCostCents: integer("settled_cost_cents"),
  entitlementRef: varchar("entitlement_ref", { length: 255 }),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  idempotencyIndex: uniqueIndex("ai_usage_ledger_org_idempotency_idx").on(table.organizationId, table.idempotencyKey),
  usageIndex: index("ai_usage_ledger_org_created_idx").on(table.organizationId, table.createdAt)
}));

export const workerMemories = pgTable("worker_memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workerId: uuid("worker_id").notNull().references(() => digitalWorkers.id),
  subjectType: varchar("subject_type", { length: 40 }),
  subjectId: uuid("subject_id"),
  memoryType: varchar("memory_type", { length: 80 }).notNull(),
  content: jsonb("content").notNull().default({}),
  provenance: jsonb("provenance").notNull().default([]),
  confidence: integer("confidence").notNull().default(0),
  sensitivity: varchar("sensitivity", { length: 40 }).notNull().default("normal"),
  validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  supersededBy: uuid("superseded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  retrievalIndex: index("worker_memories_org_worker_subject_idx").on(table.organizationId, table.workerId, table.subjectType, table.subjectId),
  expiryIndex: index("worker_memories_org_expiry_idx").on(table.organizationId, table.expiresAt)
}));

export const workerEvaluations = pgTable("worker_evaluations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workerId: uuid("worker_id").notNull().references(() => digitalWorkers.id),
  runId: uuid("run_id").references(() => workerRuns.id),
  fixtureKey: varchar("fixture_key", { length: 160 }).notNull(),
  rubricVersion: varchar("rubric_version", { length: 80 }).notNull(),
  evaluatorType: varchar("evaluator_type", { length: 40 }).notNull().default("deterministic"),
  scores: jsonb("scores").notNull().default({}),
  findings: jsonb("findings").notNull().default([]),
  passed: boolean("passed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  workerFixtureIndex: index("worker_evaluations_org_worker_fixture_idx").on(table.organizationId, table.workerId, table.fixtureKey),
  runIndex: index("worker_evaluations_org_run_idx").on(table.organizationId, table.runId)
}));

export const relationshipProfiles = pgTable("relationship_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  priority: varchar("priority", { length: 40 }).notNull().default("standard"),
  summary: text("summary").notNull().default(""),
  health: varchar("health", { length: 40 }).notNull().default("unknown"),
  healthReasons: jsonb("health_reasons").notNull().default([]),
  nextActionSummary: text("next_action_summary"),
  nextActionProposalId: uuid("next_action_proposal_id").references(() => actionProposals.id),
  sourceWatermark: timestamp("source_watermark", { withTimezone: true }),
  analysisVersion: varchar("analysis_version", { length: 80 }),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  contactIndex: uniqueIndex("relationship_profiles_org_contact_idx").on(table.organizationId, table.contactId),
  companyIndex: uniqueIndex("relationship_profiles_org_company_idx").on(table.organizationId, table.companyId),
  queueIndex: index("relationship_profiles_org_priority_health_idx").on(table.organizationId, table.priority, table.health)
}));

export const relationshipFacts = pgTable("relationship_facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  profileId: uuid("profile_id").notNull().references(() => relationshipProfiles.id),
  factType: varchar("fact_type", { length: 100 }).notNull(),
  value: jsonb("value").notNull().default({}),
  assertion: varchar("assertion", { length: 40 }).notNull().default("inferred"),
  confidence: integer("confidence").notNull().default(0),
  evidenceRefs: jsonb("evidence_refs").notNull().default([]),
  validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  profileIndex: index("relationship_facts_org_profile_idx").on(table.organizationId, table.profileId)
}));

export const relationshipSignals = pgTable("relationship_signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  profileId: uuid("profile_id").notNull().references(() => relationshipProfiles.id),
  signalType: varchar("signal_type", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 40 }).notNull().default("low"),
  title: varchar("title", { length: 200 }).notNull(),
  explanation: text("explanation").notNull().default(""),
  evidenceRefs: jsonb("evidence_refs").notNull().default([]),
  confidence: integer("confidence").notNull().default(0),
  status: varchar("status", { length: 40 }).notNull().default("open"),
  dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true })
}, (table) => ({
  dedupeIndex: uniqueIndex("relationship_signals_org_dedupe_idx").on(table.organizationId, table.dedupeKey),
  queueIndex: index("relationship_signals_org_status_severity_idx").on(table.organizationId, table.status, table.severity)
}));

export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  triggerType: varchar("trigger_type", { length: 80 }).notNull(),
  definition: jsonb("definition").notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const workflowEnrollments = pgTable("workflow_enrollments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  status: varchar("status", { length: 40 }).notNull().default("active"),
  currentStep: integer("current_step").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  enrollmentId: uuid("enrollment_id").notNull().references(() => workflowEnrollments.id),
  stepIndex: integer("step_index").notNull(),
  status: varchar("status", { length: 40 }).notNull().default("queued"),
  result: jsonb("result").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const experiments = pgTable("experiments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  name: varchar("name", { length: 160 }).notNull(),
  variants: jsonb("variants").notNull().default([]),
  conversionGoal: varchar("conversion_goal", { length: 120 }),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  provider: varchar("provider", { length: 50 }).notNull().default("hubspot"),
  status: varchar("status", { length: 40 }).notNull().default("queued"),
  mode: varchar("mode", { length: 40 }).notNull().default("api"),
  stats: jsonb("stats").notNull().default({}),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const importRows = pgTable("import_rows", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  importJobId: uuid("import_job_id").notNull().references(() => importJobs.id),
  objectType: varchar("object_type", { length: 50 }).notNull(),
  externalId: varchar("external_id", { length: 255 }),
  status: varchar("status", { length: 40 }).notNull().default("pending"),
  payload: jsonb("payload").notNull().default({}),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const savedViews = pgTable("saved_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  objectType: varchar("object_type", { length: 50 }).notNull(),
  presentation: varchar("presentation", { length: 40 }).notNull().default("list"),
  visibility: varchar("visibility", { length: 40 }).notNull().default("private"),
  filterAst: jsonb("filter_ast").notNull().default({}),
  columns: jsonb("columns").notNull().default([]),
  boardConfig: jsonb("board_config").notNull().default({}),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  visibilityIndex: index("saved_views_org_object_visibility_creator_idx").on(
    table.organizationId,
    table.objectType,
    table.visibility,
    table.createdBy
  )
}));

export const viewPreferences = pgTable("view_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => crmUsers.id),
  objectType: varchar("object_type", { length: 50 }).notNull(),
  presentation: varchar("presentation", { length: 40 }).notNull(),
  viewId: uuid("view_id").references(() => savedViews.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  preferenceIndex: uniqueIndex("view_preferences_org_user_object_presentation_idx").on(
    table.organizationId,
    table.userId,
    table.objectType,
    table.presentation
  )
}));

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
}, (table) => ({
  createdIndex: index("audit_events_org_created_idx").on(table.organizationId, table.createdAt)
}));

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  kind: varchar("kind", { length: 80 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  dedupeKey: varchar("dedupe_key", { length: 255 }),
  priority: integer("priority").notNull().default(100),
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  queueIndex: index("jobs_queue_idx").on(table.status, table.availableAt, table.priority),
  dedupeIndex: uniqueIndex("jobs_dedupe_idx").on(table.dedupeKey)
}));

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const reportDefinitions = pgTable("report_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  definition: jsonb("definition").notNull().default({}),
  attributionModel: varchar("attribution_model", { length: 40 }).default("last_touch"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const schema = {
  organizations,
  organizationResendDomains,
  organizationBilling,
  stripeEvents,
  crmUsers,
  contacts,
  companies,
  contactCompanyAssociations,
  propertyDefinitions,
  propertyHistory,
  externalRecordIds,
  subscriptionTypes,
  contactSubscriptions,
  suppressionEntries,
  customerEvents,
  contactIdentities,
  emailTrackingAddresses,
  lists,
  listMemberships,
  segments,
  forms,
  formSubmissions,
  emailTemplates,
  campaigns,
  campaignApprovals,
  campaignRecipients,
  emailSends,
  emailEvents,
  emailActivities,
  webhookEvents,
  agentIdentities,
  workerInstructionVersions,
  workerPolicySets,
  modelProfiles,
  digitalWorkers,
  workerToolGrants,
  workerMissions,
  workerRuns,
  workerRunCredentials,
  workerRunSteps,
  workerTools,
  actionProposals,
  approvals,
  aiEntitlements,
  aiUsageLedger,
  workerMemories,
  workerEvaluations,
  relationshipProfiles,
  relationshipFacts,
  relationshipSignals,
  workflows,
  workflowEnrollments,
  workflowRuns,
  experiments,
  importJobs,
  importRows,
  savedViews,
  viewPreferences,
  auditEvents,
  jobs,
  outboxEvents,
  reportDefinitions
};

export const currentTimestamp = sql`CURRENT_TIMESTAMP`;
export type NumericString = `${number}`;
export type Money = typeof numeric;
