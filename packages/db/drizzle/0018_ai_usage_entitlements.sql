-- Additive: separate AI entitlements and an idempotent usage/cost ledger.
CREATE TABLE IF NOT EXISTS "ai_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "feature_key" varchar(120) NOT NULL,
  "decision" varchar(40) NOT NULL,
  "reason_code" varchar(120) NOT NULL,
  "source_ref" varchar(255),
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_entitlements_org_feature_idx" ON "ai_entitlements" ("organization_id", "feature_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "worker_id" uuid REFERENCES "digital_workers"("id"),
  "mission_id" uuid REFERENCES "worker_missions"("id"),
  "run_id" uuid REFERENCES "worker_runs"("id"),
  "step_id" uuid REFERENCES "worker_run_steps"("id"),
  "provider_alias" varchar(120) NOT NULL,
  "model" varchar(160) NOT NULL,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "estimated_cost_cents" integer NOT NULL DEFAULT 0,
  "settled_cost_cents" integer,
  "entitlement_ref" varchar(255),
  "idempotency_key" varchar(255) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_ledger_org_idempotency_idx" ON "ai_usage_ledger" ("organization_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_ledger_org_created_idx" ON "ai_usage_ledger" ("organization_id", "created_at");
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_entitlements', 'ai_usage_ledger'] LOOP
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
