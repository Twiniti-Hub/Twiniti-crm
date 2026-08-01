ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "provisioning_key" varchar(255);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_provisioning_key_idx" ON "organizations" USING btree ("provisioning_key");
