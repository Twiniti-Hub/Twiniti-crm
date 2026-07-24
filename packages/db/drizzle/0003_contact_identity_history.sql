ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone" varchar(80);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone_normalized" varchar(40);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "merged_into_contact_id" uuid;
--> statement-breakpoint
ALTER TABLE "property_history" ADD COLUMN IF NOT EXISTS "change_set_id" uuid;
--> statement-breakpoint
ALTER TABLE "property_history" ADD COLUMN IF NOT EXISTS "source" varchar(80);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"identity_type" varchar(40) NOT NULL,
	"provider" varchar(80) DEFAULT 'crm' NOT NULL,
	"normalized_value" varchar(500) NOT NULL,
	"display_value" varchar(500),
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"source" varchar(80),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_merged_into_contact_id_contacts_id_fk" FOREIGN KEY ("merged_into_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contact_identities_active_value_idx" ON "contact_identities" USING btree ("organization_id","identity_type","provider","normalized_value") WHERE "ended_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_identities_contact_idx" ON "contact_identities" USING btree ("organization_id","contact_id","identity_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_identities_lookup_idx" ON "contact_identities" USING btree ("organization_id","normalized_value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_history_change_set_idx" ON "property_history" USING btree ("organization_id","change_set_id");
--> statement-breakpoint
UPDATE "contacts"
SET "phone_normalized" = CASE
	WHEN "phone" IS NULL OR btrim("phone") = '' THEN NULL
	WHEN "phone" LIKE '+%' THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
	ELSE regexp_replace("phone", '[^0-9]', '', 'g')
END
WHERE "phone" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "contact_identities" (
	"organization_id", "contact_id", "identity_type", "provider", "normalized_value", "display_value", "is_primary", "source"
)
SELECT "organization_id", "id", 'email', 'crm', "email_normalized", "email", true, 'migration'
FROM "contacts"
WHERE btrim("email_normalized") <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "contact_identities" (
	"organization_id", "contact_id", "identity_type", "provider", "normalized_value", "display_value", "is_primary", "source"
)
SELECT "organization_id", "id", 'phone', 'crm', "phone_normalized", "phone", true, 'migration'
FROM "contacts"
WHERE "phone_normalized" IS NOT NULL AND btrim("phone_normalized") <> ''
ON CONFLICT DO NOTHING;
