import { z } from "zod";

export const propertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string())
]);

export const roleSchema = z.enum(["admin", "member"]);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  inviteAdminEmail: z.string().trim().email().optional(),
  joinAsAdmin: z.boolean().optional()
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email(),
  role: roleSchema.default("member")
});

export const updateMemberSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional()
}).refine((value) => value.role !== undefined || value.active !== undefined, {
  message: "Provide role and/or active"
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16).max(128)
});

export const organizationSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().optional(),
  memberCount: z.number().int().nonnegative().optional()
});

export const paginationMetaSchema = z.object({
  limit: z.number().int().positive(),
  cursor: z.string().nullable().optional(),
  nextCursor: z.string().nullable().optional(),
  total: z.number().int().nonnegative().optional()
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional()
  })
});

export const duplicateEmailConflictSchema = z.object({
  status: z.literal("conflict"),
  reason: z.literal("duplicate_email"),
  existing_contact_id: z.string().min(1),
  next_actions: z.array(z.enum(["update_existing", "create_anyway"])).min(1)
});

export const contactSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  phone: z.string().trim().max(80).nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  lifecycleStage: z.string().nullable(),
  properties: z.record(propertyValueSchema)
});

export const createContactSchema = z.object({
  email: z.string().email(),
  phone: z.string().trim().max(80).nullable().optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  lifecycleStage: z.string().trim().max(80).optional(),
  properties: z.record(propertyValueSchema).default({})
});

export const updateContactSchema = createContactSchema.partial().extend({
  version: z.number().int().nonnegative().optional()
});

export const upsertContactSchema = createContactSchema.extend({
  id: z.string().uuid().optional()
});

export const contactSearchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional()
});

export const companySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  properties: z.record(propertyValueSchema)
});

export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(255).optional(),
  industry: z.string().trim().max(120).optional(),
  properties: z.record(propertyValueSchema).default({})
});

export const updateCompanySchema = createCompanySchema.partial().extend({
  version: z.number().int().nonnegative().optional()
});

export const companySearchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional()
});

export const propertyDataTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "enum",
  "multi_enum",
  "json"
]);

export const propertyDefinitionSchema = z.object({
  id: z.string().uuid(),
  objectType: z.enum(["contact", "company"]),
  internalName: z.string(),
  label: z.string(),
  dataType: propertyDataTypeSchema,
  fieldGroup: z.string().nullable().optional(),
  options: z.array(z.unknown()).default([]),
  required: z.boolean().default(false),
  searchable: z.boolean().default(false),
  archived: z.boolean().default(false)
});

export const createPropertyDefinitionSchema = z.object({
  objectType: z.enum(["contact", "company"]),
  internalName: z.string().trim().min(1).max(150).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().trim().min(1).max(200),
  dataType: propertyDataTypeSchema,
  fieldGroup: z.string().trim().max(100).optional(),
  options: z.array(z.unknown()).default([]),
  required: z.boolean().default(false),
  searchable: z.boolean().default(false)
});

export const updatePropertyDefinitionSchema = createPropertyDefinitionSchema.partial().omit({
  objectType: true,
  internalName: true
});

export const agentIdentitySchema = z.object({
  name: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(1).max(500),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().nullable()
});

export const createAgentIdentitySchema = z.object({
  name: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(1).max(500),
  scopes: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().datetime().nullable().optional(),
  rateLimitPerMinute: z.number().int().positive().max(10_000).optional()
});

export const agentIdentityResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  purpose: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
  rateLimitPerMinute: z.number().int().positive(),
  revokedAt: z.string().datetime().nullable().optional(),
  lastUsedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  credential: z.string().optional()
});

export type FilterAst =
  | { op: "and" | "or"; children: FilterAst[] }
  | {
      op: "eq" | "neq" | "contains" | "gt" | "lt" | "is_null" | "not_null";
      field: string;
      value?: string | number | boolean | null;
    };

export const filterAstSchema: z.ZodType<FilterAst> = z.lazy(() =>
  z.union([
    z.object({
      op: z.enum(["and", "or"]),
      children: z.array(filterAstSchema).min(1)
    }),
    z.object({
      op: z.enum(["eq", "neq", "contains", "gt", "lt", "is_null", "not_null"]),
      field: z.string().min(1),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
    })
  ])
);

export const createSegmentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  filterAst: filterAstSchema
});

export const updateSegmentSchema = createSegmentSchema.partial();

export const segmentSchema = createSegmentSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export const createListSchema = z.object({
  name: z.string().trim().min(1).max(160),
  listType: z.enum(["static", "dynamic"]).default("static"),
  description: z.string().trim().max(2000).optional()
});

export const updateListSchema = createListSchema.partial();

export const listSchema = createListSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime().optional()
});

export const formFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "email", "textarea", "select", "checkbox", "hidden"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional()
});

export const createFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  fields: z.array(formFieldSchema).default([]),
  settings: z.record(z.unknown()).default({}),
  published: z.boolean().default(false)
});

export const updateFormSchema = createFormSchema.partial();

export const formSchema = createFormSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime().optional()
});

export const formSubmissionSchema = z.object({
  formId: z.string().uuid(),
  payload: z.record(z.unknown()),
  contactId: z.string().uuid().optional()
});

export const campaignStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
  "failed"
]);

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  templateId: z.string().uuid().optional(),
  segmentId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
  subject: z.string().trim().max(300).optional(),
  htmlBody: z.string().optional(),
  scheduledAt: z.string().datetime().optional()
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: campaignStatusSchema.optional()
});

export const campaignSchema = createCampaignSchema.extend({
  id: z.string().uuid(),
  status: campaignStatusSchema,
  contentHash: z.string().nullable().optional(),
  recipientCount: z.number().int().nonnegative().optional(),
  createdByType: z.enum(["user", "agent", "system"]).optional(),
  createdById: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export const requestCampaignApprovalSchema = z.object({
  campaignId: z.string().uuid(),
  expiresAt: z.string().datetime().optional()
});

export const decideCampaignApprovalSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(2000).optional()
});

export const campaignApprovalSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  recipientCount: z.number().int().nonnegative(),
  contentHash: z.string(),
  requestedBy: z.string(),
  approvedBy: z.string().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  decidedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime().optional()
});

export const workflowTriggerTypeSchema = z.enum([
  "form_submission",
  "contact_created",
  "property_changed",
  "segment_enter",
  "manual",
  "event"
]);

export const workflowStatusSchema = z.enum(["draft", "active", "paused", "archived"]);

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(160),
  triggerType: workflowTriggerTypeSchema,
  definition: z.record(z.unknown()).default({}),
  status: workflowStatusSchema.default("draft")
});

export const updateWorkflowSchema = createWorkflowSchema.partial();

export const workflowSchema = createWorkflowSchema.extend({
  id: z.string().uuid(),
  version: z.number().int().positive().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export const ingestEventSchema = z.object({
  eventType: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(80),
  occurredAt: z.string().datetime().optional(),
  contactId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  payload: z.record(z.unknown()).default({}),
  dedupeKey: z.string().trim().max(255).optional(),
  privacyClass: z.enum(["standard", "sensitive", "restricted"]).optional()
});

export const createImportJobSchema = z.object({
  provider: z.enum(["hubspot", "csv", "manual"]).default("hubspot"),
  mode: z.enum(["api", "csv", "package"]).default("api"),
  options: z.record(z.unknown()).default({})
});

/** HubSpot Properties API–like shape for one-time definition import. */
export const hubspotPropertyDefinitionImportSchema = z.object({
  name: z.string().trim().min(1).max(150),
  label: z.string().trim().min(1).max(200).optional(),
  type: z.string().trim().optional(),
  fieldType: z.string().trim().optional(),
  groupName: z.string().trim().max(100).optional(),
  options: z
    .array(
      z.object({
        label: z.string().optional(),
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
        displayOrder: z.number().optional(),
        hidden: z.boolean().optional()
      }).passthrough()
    )
    .optional()
    .default([]),
  hidden: z.boolean().optional(),
  hasUniqueValue: z.boolean().optional()
}).passthrough();

export const hubspotPropertyDefinitionsImportBodySchema = z.object({
  objectType: z.enum(["contact", "company"]).default("contact"),
  properties: z.array(hubspotPropertyDefinitionImportSchema).min(1).max(5_000)
});

export const hubspotContactsImportBodySchema = z.object({
  contacts: z.array(z.record(z.unknown())).min(1).max(50_000),
  headers: z.array(z.string().trim().min(1).max(200)).max(500).optional(),
  cursor: z.number().int().nonnegative().optional()
});

export const csvContactsImportBodySchema = z.object({
  contacts: z.array(z.record(z.unknown())).min(1).max(50_000),
  headers: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
  cursor: z.number().int().nonnegative().optional()
});

export const importJobSchema = createImportJobSchema.extend({
  id: z.string().uuid(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  stats: z.record(z.unknown()).default({}),
  error: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().nullable().optional()
});

export const agentToolNameSchema = z.enum([
  "search_contacts",
  "get_contact",
  "create_contact",
  "upsert_contact",
  "update_contact",
  "get_contact_timeline",
  "search_companies",
  "get_company",
  "create_company",
  "update_company",
  "get_segment",
  "estimate_segment_size",
  "create_campaign_draft",
  "preview_campaign",
  "validate_campaign",
  "request_campaign_approval",
  "send_approved_campaign",
  "get_campaign_status",
  "get_email_events"
]);

export type PropertyValue = z.infer<typeof propertyValueSchema>;
export type Role = z.infer<typeof roleSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type DuplicateEmailConflict = z.infer<typeof duplicateEmailConflictSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type CreateContact = z.infer<typeof createContactSchema>;
export type UpdateContact = z.infer<typeof updateContactSchema>;
export type UpsertContact = z.infer<typeof upsertContactSchema>;
export type ContactSearch = z.infer<typeof contactSearchSchema>;
export type Company = z.infer<typeof companySchema>;
export type CreateCompany = z.infer<typeof createCompanySchema>;
export type UpdateCompany = z.infer<typeof updateCompanySchema>;
export type CompanySearch = z.infer<typeof companySearchSchema>;
export type PropertyDefinition = z.infer<typeof propertyDefinitionSchema>;
export type CreatePropertyDefinition = z.infer<typeof createPropertyDefinitionSchema>;
export type UpdatePropertyDefinition = z.infer<typeof updatePropertyDefinitionSchema>;
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;
export type CreateAgentIdentity = z.infer<typeof createAgentIdentitySchema>;
export type AgentIdentityResponse = z.infer<typeof agentIdentityResponseSchema>;
export type CreateSegment = z.infer<typeof createSegmentSchema>;
export type UpdateSegment = z.infer<typeof updateSegmentSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type CreateList = z.infer<typeof createListSchema>;
export type UpdateList = z.infer<typeof updateListSchema>;
export type List = z.infer<typeof listSchema>;
export type CreateForm = z.infer<typeof createFormSchema>;
export type UpdateForm = z.infer<typeof updateFormSchema>;
export type Form = z.infer<typeof formSchema>;
export type FormSubmission = z.infer<typeof formSubmissionSchema>;
export type CreateCampaign = z.infer<typeof createCampaignSchema>;
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type RequestCampaignApproval = z.infer<typeof requestCampaignApprovalSchema>;
export type DecideCampaignApproval = z.infer<typeof decideCampaignApprovalSchema>;
export type CampaignApproval = z.infer<typeof campaignApprovalSchema>;
export type CreateWorkflow = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflow = z.infer<typeof updateWorkflowSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type IngestEvent = z.infer<typeof ingestEventSchema>;
export type CreateImportJob = z.infer<typeof createImportJobSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type HubspotPropertyDefinitionImport = z.infer<typeof hubspotPropertyDefinitionImportSchema>;
export type HubspotPropertyDefinitionsImportBody = z.infer<typeof hubspotPropertyDefinitionsImportBodySchema>;
export type HubspotContactsImportBody = z.infer<typeof hubspotContactsImportBodySchema>;
export type AgentToolName = z.infer<typeof agentToolNameSchema>;
