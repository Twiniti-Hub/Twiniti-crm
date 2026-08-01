ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_provisioning_status" varchar(32) DEFAULT 'pending' NOT NULL;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_organization_id" varchar(255);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_id" varchar(255);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_user_id" varchar(255);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_decision" varchar(32);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_status" varchar(32);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_reason_code" varchar(80);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_expires_at" timestamp with time zone;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "license_grace_cutoff" timestamp with time zone;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "last_license_checked_at" timestamp with time zone;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "last_license_sync_at" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "dedupe_key" varchar(255);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_dedupe_idx" ON "jobs" USING btree ("dedupe_key");
