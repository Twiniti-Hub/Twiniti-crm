-- Additive: durable Digital Worker missions, runs and idempotent steps.
CREATE TABLE IF NOT EXISTS "worker_missions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "worker_id" uuid NOT NULL REFERENCES "digital_workers"("id"),
  "goal" text NOT NULL,
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "success_criteria" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(40) NOT NULL DEFAULT 'draft',
  "priority" integer NOT NULL DEFAULT 100,
  "budget" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "requested_by" varchar(255) NOT NULL,
  "due_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_missions_org_status_priority_idx" ON "worker_missions" ("organization_id", "status", "priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_missions_org_worker_idx" ON "worker_missions" ("organization_id", "worker_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "mission_id" uuid NOT NULL REFERENCES "worker_missions"("id"),
  "attempt" integer NOT NULL DEFAULT 1,
  "trigger" varchar(80) NOT NULL DEFAULT 'manual',
  "input_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "input_hash" varchar(128) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'queued',
  "current_step" integer NOT NULL DEFAULT 0,
  "lease_token" varchar(128),
  "lease_expires_at" timestamptz,
  "heartbeat_at" timestamptz,
  "usage" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "terminal_reason" text,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_runs_org_status_created_idx" ON "worker_runs" ("organization_id", "status", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_runs_mission_attempt_idx" ON "worker_runs" ("mission_id", "attempt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_run_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "run_id" uuid NOT NULL REFERENCES "worker_runs"("id"),
  "sequence" integer NOT NULL,
  "type" varchar(40) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'pending',
  "idempotency_key" varchar(255) NOT NULL,
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_code" varchar(80),
  "error_message" text,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_run_steps_run_sequence_idx" ON "worker_run_steps" ("run_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_run_steps_org_idempotency_idx" ON "worker_run_steps" ("organization_id", "idempotency_key");
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['worker_missions', 'worker_runs', 'worker_run_steps'] LOOP
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
