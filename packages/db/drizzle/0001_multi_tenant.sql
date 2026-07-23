ALTER TABLE "crm_users" ALTER COLUMN "role" SET DEFAULT 'member';
--> statement-breakpoint
UPDATE "crm_users" SET "role" = 'admin' WHERE "role" IN ('owner', 'admin');
--> statement-breakpoint
UPDATE "crm_users" SET "role" = 'member' WHERE "role" NOT IN ('admin', 'member');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"email_normalized" varchar(320) NOT NULL,
	"role" varchar(32) DEFAULT 'member' NOT NULL,
	"token" varchar(64) NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_crm_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_token_idx" ON "organization_invitations" USING btree ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_org_email_pending_idx" ON "organization_invitations" USING btree ("organization_id","email_normalized") WHERE "accepted_at" is null;
