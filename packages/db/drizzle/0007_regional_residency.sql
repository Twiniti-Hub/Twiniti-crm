ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "residency_region" varchar(2) DEFAULT 'us' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "routing_policy_version" varchar(40) DEFAULT 'country-v1' NOT NULL;
ALTER TABLE "crm_users" ADD COLUMN IF NOT EXISTS "country_code" varchar(2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_residency_region_check'
  ) THEN
    ALTER TABLE "organizations"
      ADD CONSTRAINT "organizations_residency_region_check"
      CHECK ("residency_region" IN ('eu', 'uk', 'us'));
  END IF;
END $$;
