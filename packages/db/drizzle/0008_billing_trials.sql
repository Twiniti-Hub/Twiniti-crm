ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "stripe_subscription_status" varchar(32);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "trial_kind" varchar(32) DEFAULT 'none' NOT NULL;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "trial_start" timestamp with time zone;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "trial_end" timestamp with time zone;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "stripe_promotion_code_id" varchar(255);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "stripe_coupon_id" varchar(255);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "trial_converted_at" timestamp with time zone;
