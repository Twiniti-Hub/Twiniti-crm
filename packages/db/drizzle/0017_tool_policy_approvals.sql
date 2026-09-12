-- Additive: versioned tool registry and hash-bound action proposals/approvals.
CREATE TABLE IF NOT EXISTS "worker_tools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" varchar(120) NOT NULL,
  "version" varchar(40) NOT NULL,
  "adapter" varchar(40) NOT NULL,
  "input_schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output_schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "required_scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "risk_tier" varchar(40) NOT NULL DEFAULT 'read',
  "side_effect_class" varchar(40) NOT NULL DEFAULT 'none',
  "status" varchar(40) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_tools_org_name_version_idx" ON "worker_tools" ("organization_id", "name", "version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "action_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "run_id" uuid REFERENCES "worker_runs"("id"),
  "step_id" uuid REFERENCES "worker_run_steps"("id"),
  "action_type" varchar(120) NOT NULL,
  "target" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "content_hash" varchar(128) NOT NULL,
  "risk_tier" varchar(40) NOT NULL,
  "rationale" text NOT NULL DEFAULT '',
  "evidence" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "policy_decision" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(40) NOT NULL DEFAULT 'proposed',
  "expires_at" timestamptz NOT NULL,
  "created_by" varchar(255) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_proposals_org_status_expiry_idx" ON "action_proposals" ("organization_id", "status", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_proposals_org_hash_idx" ON "action_proposals" ("organization_id", "content_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "proposal_id" uuid NOT NULL REFERENCES "action_proposals"("id"),
  "decision" varchar(40) NOT NULL,
  "actor_id" varchar(255) NOT NULL,
  "rationale" text NOT NULL DEFAULT '',
  "proposal_hash" varchar(128) NOT NULL,
  "decided_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "approvals_org_proposal_idx" ON "approvals" ("organization_id", "proposal_id");
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['worker_tools', 'action_proposals', 'approvals'] LOOP
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
