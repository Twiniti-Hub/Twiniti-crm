-- Additive: company lifecycle stages, board saved views, view preferences, board indexes.
-- Classification: additive (backward-compatible with currently deployed application).
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "lifecycle_stage" varchar(80);
--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN IF NOT EXISTS "presentation" varchar(40) NOT NULL DEFAULT 'list';
--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN IF NOT EXISTS "visibility" varchar(40) NOT NULL DEFAULT 'private';
--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN IF NOT EXISTS "board_config" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "view_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "object_type" varchar(50) NOT NULL,
  "presentation" varchar(40) NOT NULL,
  "view_id" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_user_id_crm_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_view_id_saved_views_id_fk"
    FOREIGN KEY ("view_id") REFERENCES "public"."saved_views"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "view_preferences_org_user_object_presentation_idx"
  ON "view_preferences" USING btree ("organization_id","user_id","object_type","presentation");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_org_lifecycle_updated_idx"
  ON "contacts" USING btree ("organization_id","lifecycle_stage","updated_at" DESC,"id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_org_lifecycle_updated_idx"
  ON "companies" USING btree ("organization_id","lifecycle_stage","updated_at" DESC,"id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_views_org_object_visibility_creator_idx"
  ON "saved_views" USING btree ("organization_id","object_type","visibility","created_by");
--> statement-breakpoint
ALTER TABLE "view_preferences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "view_preferences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS twiniti_organization_isolation ON public.view_preferences;
--> statement-breakpoint
CREATE POLICY twiniti_organization_isolation ON public.view_preferences
  USING (
    current_setting('twiniti.service_context', true) = 'true'
    OR (twiniti_current_organization_id() IS NOT NULL
    AND view_preferences.organization_id = twiniti_current_organization_id()
    AND twiniti_is_active_member(view_preferences.organization_id, twiniti_current_subject()))
  )
  WITH CHECK (
    current_setting('twiniti.service_context', true) = 'true'
    OR (twiniti_current_organization_id() IS NOT NULL
    AND view_preferences.organization_id = twiniti_current_organization_id()
    AND twiniti_is_active_member(view_preferences.organization_id, twiniti_current_subject()))
  );
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.view_preferences TO twiniti_app;
