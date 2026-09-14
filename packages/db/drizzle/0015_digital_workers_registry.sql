-- Additive: Digital Worker registry foundation. Configuration is versioned and organization-scoped.
CREATE TABLE IF NOT EXISTS "worker_instruction_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "version" integer NOT NULL,
  "instructions" text NOT NULL,
  "input_schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output_schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "checksum" varchar(128) NOT NULL,
  "created_by" varchar(255) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_instruction_versions_org_version_idx" ON "worker_instruction_versions" ("organization_id", "version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_policy_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" varchar(120) NOT NULL,
  "version" integer NOT NULL,
  "policy" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "checksum" varchar(128) NOT NULL,
  "created_by" varchar(255) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_policy_sets_org_name_version_idx" ON "worker_policy_sets" ("organization_id", "name", "version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" varchar(120) NOT NULL,
  "provider_alias" varchar(120) NOT NULL,
  "capabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(40) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "model_profiles_org_name_idx" ON "model_profiles" ("organization_id", "name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "digital_workers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" varchar(120) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "role" varchar(80) NOT NULL,
  "owner_user_id" uuid REFERENCES "crm_users"("id"),
  "agent_identity_id" uuid REFERENCES "agent_identities"("id"),
  "status" varchar(40) NOT NULL DEFAULT 'draft',
  "autonomy_level" varchar(40) NOT NULL DEFAULT 'observe',
  "instruction_version_id" uuid REFERENCES "worker_instruction_versions"("id"),
  "policy_set_id" uuid REFERENCES "worker_policy_sets"("id"),
  "model_profile_id" uuid REFERENCES "model_profiles"("id"),
  "default_budget" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "feature_key" varchar(120),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "digital_workers_org_slug_idx" ON "digital_workers" ("organization_id", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "digital_workers_org_status_idx" ON "digital_workers" ("organization_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_tool_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "worker_id" uuid NOT NULL REFERENCES "digital_workers"("id"),
  "tool_name" varchar(120) NOT NULL,
  "tool_version" varchar(40) NOT NULL,
  "constraints" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_tool_grants_org_worker_tool_version_idx" ON "worker_tool_grants" ("organization_id", "worker_id", "tool_name", "tool_version");
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['worker_instruction_versions', 'worker_policy_sets', 'model_profiles', 'digital_workers', 'worker_tool_grants'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS twiniti_organization_isolation ON public.%I', table_name);
    EXECUTE format($policy$
      CREATE POLICY twiniti_organization_isolation ON public.%I
      USING (current_setting('twiniti.service_context', true) = 'true'
        OR (twiniti_current_organization_id() IS NOT NULL
        AND organization_id = twiniti_current_organization_id()
        AND twiniti_is_active_member(organization_id, twiniti_current_subject())))
      WITH CHECK (current_setting('twiniti.service_context', true) = 'true'
        OR (twiniti_current_organization_id() IS NOT NULL
        AND organization_id = twiniti_current_organization_id()
        AND twiniti_is_active_member(organization_id, twiniti_current_subject())))
    $policy$, table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO twiniti_app', table_name);
  END LOOP;
END $$;
