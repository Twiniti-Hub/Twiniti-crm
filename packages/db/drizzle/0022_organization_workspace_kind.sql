ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "workspace_kind" varchar(32) DEFAULT 'company' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_workspace_kind_check"
    CHECK ("workspace_kind" IN ('company', 'personal'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_workspace_kind_idx" ON "organizations" USING btree ("workspace_kind");
