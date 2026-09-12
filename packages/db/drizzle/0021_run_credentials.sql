CREATE TABLE IF NOT EXISTS "worker_run_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"audience" varchar(160) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "worker_run_credentials" ADD CONSTRAINT "worker_run_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_run_credentials" ADD CONSTRAINT "worker_run_credentials_run_id_worker_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."worker_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_run_credentials" ADD CONSTRAINT "worker_run_credentials_worker_id_digital_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."digital_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worker_run_credentials_org_token_idx" ON "worker_run_credentials" USING btree ("organization_id","token_hash");--> statement-breakpoint
CREATE INDEX "worker_run_credentials_org_run_expiry_idx" ON "worker_run_credentials" USING btree ("organization_id","run_id","expires_at");
--> statement-breakpoint
ALTER TABLE "worker_run_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "worker_run_credentials" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "worker_run_credentials_org_isolation" ON "worker_run_credentials" USING (twiniti_organization_isolation("organization_id")) WITH CHECK (twiniti_organization_isolation("organization_id"));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "worker_run_credentials" TO twiniti_app;
