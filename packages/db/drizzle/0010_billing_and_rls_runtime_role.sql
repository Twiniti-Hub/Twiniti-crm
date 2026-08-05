ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "stripe_subscription_status" varchar(32);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "trial_kind" varchar(32) NOT NULL DEFAULT 'none';
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "trial_start" timestamptz;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "trial_end" timestamptz;
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "stripe_promotion_code_id" varchar(255);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "stripe_coupon_id" varchar(255);
ALTER TABLE "organization_billing" ADD COLUMN IF NOT EXISTS "trial_converted_at" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'twiniti_app') THEN
    CREATE ROLE twiniti_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO twiniti_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO twiniti_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO twiniti_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO twiniti_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO twiniti_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO twiniti_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO twiniti_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT twiniti_app TO neondb_owner;
  END IF;
END
$$;
