CREATE TABLE IF NOT EXISTS "relationship_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"fact_type" varchar(100) NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assertion" varchar(40) DEFAULT 'inferred' NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationship_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"company_id" uuid,
	"priority" varchar(40) DEFAULT 'standard' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"health" varchar(40) DEFAULT 'unknown' NOT NULL,
	"health_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_action_summary" text,
	"next_action_proposal_id" uuid,
	"source_watermark" timestamp with time zone,
	"analysis_version" varchar(80),
	"generated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationship_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"signal_type" varchar(100) NOT NULL,
	"severity" varchar(40) DEFAULT 'low' NOT NULL,
	"title" varchar(200) NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"status" varchar(40) DEFAULT 'open' NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "relationship_facts" ADD CONSTRAINT "relationship_facts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_facts" ADD CONSTRAINT "relationship_facts_profile_id_relationship_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."relationship_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_profiles" ADD CONSTRAINT "relationship_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_profiles" ADD CONSTRAINT "relationship_profiles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_profiles" ADD CONSTRAINT "relationship_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_profiles" ADD CONSTRAINT "relationship_profiles_next_action_proposal_id_action_proposals_id_fk" FOREIGN KEY ("next_action_proposal_id") REFERENCES "public"."action_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_signals" ADD CONSTRAINT "relationship_signals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_signals" ADD CONSTRAINT "relationship_signals_profile_id_relationship_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."relationship_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relationship_facts_org_profile_idx" ON "relationship_facts" USING btree ("organization_id","profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_profiles_org_contact_idx" ON "relationship_profiles" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_profiles_org_company_idx" ON "relationship_profiles" USING btree ("organization_id","company_id");--> statement-breakpoint
CREATE INDEX "relationship_profiles_org_priority_health_idx" ON "relationship_profiles" USING btree ("organization_id","priority","health");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_signals_org_dedupe_idx" ON "relationship_signals" USING btree ("organization_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "relationship_signals_org_status_severity_idx" ON "relationship_signals" USING btree ("organization_id","status","severity");
--> statement-breakpoint
ALTER TABLE "relationship_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "relationship_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "relationship_profiles_org_isolation" ON "relationship_profiles" USING (twiniti_organization_isolation("organization_id")) WITH CHECK (twiniti_organization_isolation("organization_id"));--> statement-breakpoint
ALTER TABLE "relationship_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "relationship_facts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "relationship_facts_org_isolation" ON "relationship_facts" USING (twiniti_organization_isolation("organization_id")) WITH CHECK (twiniti_organization_isolation("organization_id"));--> statement-breakpoint
ALTER TABLE "relationship_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "relationship_signals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "relationship_signals_org_isolation" ON "relationship_signals" USING (twiniti_organization_isolation("organization_id")) WITH CHECK (twiniti_organization_isolation("organization_id"));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "relationship_profiles", "relationship_facts", "relationship_signals" TO twiniti_app;
