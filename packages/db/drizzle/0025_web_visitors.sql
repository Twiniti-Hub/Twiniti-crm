CREATE TABLE "web_visitor_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"enabled" boolean DEFAULT false NOT NULL,
	"api_key_ciphertext" text,
	"webhook_token_hash" varchar(128) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_webhook_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "web_visitor_integrations_org_idx" ON "web_visitor_integrations" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "web_visitor_integrations_token_idx" ON "web_visitor_integrations" ("webhook_token_hash");
--> statement-breakpoint
CREATE TABLE "web_visitor_identity_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"integration_id" uuid NOT NULL REFERENCES "web_visitor_integrations"("id"),
	"identity_fingerprint" varchar(128) NOT NULL,
	"provider_visitor_id" varchar(255),
	"contact_id" uuid REFERENCES "contacts"("id"),
	"company_id" uuid REFERENCES "companies"("id"),
	"resolution_state" varchar(32) DEFAULT 'unresolved' NOT NULL,
	"confidence" varchar(16),
	"match_method" varchar(64),
	"candidate_contact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolver_version" varchar(40) DEFAULT 'wv-identity-v1' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "web_visitor_identity_mappings_fingerprint_idx" ON "web_visitor_identity_mappings" ("organization_id", "integration_id", "identity_fingerprint");
--> statement-breakpoint
CREATE INDEX "web_visitor_identity_mappings_review_idx" ON "web_visitor_identity_mappings" ("organization_id", "resolution_state", "updated_at");
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "web_visitor_visit_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "web_visitor_first_visited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "web_visitor_last_visited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "web_visitor_visit_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "web_visitor_first_visited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "web_visitor_last_visited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "dedupe_key" varchar(255);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_dedupe_idx" ON "webhook_events" ("organization_id", "provider", "dedupe_key");
--> statement-breakpoint
ALTER TABLE "web_visitor_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_visitor_integrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY twiniti_organization_isolation ON "web_visitor_integrations"
USING (
  current_setting('twiniti.service_context', true) = 'true'
  OR (twiniti_current_organization_id() IS NOT NULL
    AND organization_id = twiniti_current_organization_id()
    AND twiniti_is_active_member(organization_id, twiniti_current_subject()))
)
WITH CHECK (
  current_setting('twiniti.service_context', true) = 'true'
  OR (twiniti_current_organization_id() IS NOT NULL
    AND organization_id = twiniti_current_organization_id()
    AND twiniti_is_active_member(organization_id, twiniti_current_subject()))
);
--> statement-breakpoint
ALTER TABLE "web_visitor_identity_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_visitor_identity_mappings" FORCE ROW LEVEL SECURITY;
CREATE POLICY twiniti_organization_isolation ON "web_visitor_identity_mappings"
USING (
  current_setting('twiniti.service_context', true) = 'true'
  OR (twiniti_current_organization_id() IS NOT NULL
    AND organization_id = twiniti_current_organization_id()
    AND twiniti_is_active_member(organization_id, twiniti_current_subject()))
)
WITH CHECK (
  current_setting('twiniti.service_context', true) = 'true'
  OR (twiniti_current_organization_id() IS NOT NULL
    AND organization_id = twiniti_current_organization_id()
    AND twiniti_is_active_member(organization_id, twiniti_current_subject()))
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "web_visitor_integrations", "web_visitor_identity_mappings" TO twiniti_app;
