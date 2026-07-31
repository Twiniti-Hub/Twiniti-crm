CREATE TABLE IF NOT EXISTS "organization_billing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_checkout_session_id" varchar(255),
	"stripe_price_id" varchar(255),
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_stripe_event_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"organization_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_billing" ADD CONSTRAINT "organization_billing_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_billing_org_idx" ON "organization_billing" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_billing_customer_idx" ON "organization_billing" USING btree ("stripe_customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_billing_subscription_idx" ON "organization_billing" USING btree ("stripe_subscription_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_billing_checkout_idx" ON "organization_billing" USING btree ("stripe_checkout_session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_events_event_idx" ON "stripe_events" USING btree ("stripe_event_id");
