-- Additive: provenance-aware worker memory and versioned evaluation records.
CREATE TABLE IF NOT EXISTS "worker_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "worker_id" uuid NOT NULL REFERENCES "digital_workers"("id"),
  "subject_type" varchar(40),
  "subject_id" uuid,
  "memory_type" varchar(80) NOT NULL,
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "provenance" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "confidence" integer NOT NULL DEFAULT 0,
  "sensitivity" varchar(40) NOT NULL DEFAULT 'normal',
  "valid_from" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  "superseded_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_memories_org_worker_subject_idx" ON "worker_memories" ("organization_id", "worker_id", "subject_type", "subject_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_memories_org_expiry_idx" ON "worker_memories" ("organization_id", "expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "worker_id" uuid NOT NULL REFERENCES "digital_workers"("id"),
  "run_id" uuid REFERENCES "worker_runs"("id"),
  "fixture_key" varchar(160) NOT NULL,
  "rubric_version" varchar(80) NOT NULL,
  "evaluator_type" varchar(40) NOT NULL DEFAULT 'deterministic',
  "scores" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "findings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "passed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_evaluations_org_worker_fixture_idx" ON "worker_evaluations" ("organization_id", "worker_id", "fixture_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_evaluations_org_run_idx" ON "worker_evaluations" ("organization_id", "run_id");
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['worker_memories', 'worker_evaluations'] LOOP
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
