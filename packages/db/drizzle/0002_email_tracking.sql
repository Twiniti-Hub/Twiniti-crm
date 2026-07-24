CREATE TABLE IF NOT EXISTS "email_tracking_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(128) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"tracking_address_id" uuid,
	"direction" varchar(20) NOT NULL,
	"activity_type" varchar(40) NOT NULL,
	"provider" varchar(50) DEFAULT 'resend' NOT NULL,
	"provider_email_id" varchar(255),
	"from_email" varchar(320),
	"to_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" varchar(500),
	"message_id" varchar(500),
	"in_reply_to" varchar(500),
	"thread_key" varchar(500),
	"body_text" text,
	"body_html" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" varchar(500) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_tracking_addresses" ADD CONSTRAINT "email_tracking_addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_tracking_addresses" ADD CONSTRAINT "email_tracking_addresses_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_tracking_address_id_email_tracking_addresses_id_fk" FOREIGN KEY ("tracking_address_id") REFERENCES "public"."email_tracking_addresses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_tracking_addresses_token_idx" ON "email_tracking_addresses" USING btree ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_tracking_addresses_org_user_idx" ON "email_tracking_addresses" USING btree ("organization_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_activities_contact_idx" ON "email_activities" USING btree ("organization_id","contact_id","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_activities_dedupe_idx" ON "email_activities" USING btree ("organization_id","dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_activities_provider_idx" ON "email_activities" USING btree ("organization_id","provider_email_id");
