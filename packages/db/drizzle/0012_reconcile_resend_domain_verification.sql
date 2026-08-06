ALTER TABLE "organization_resend_domains"
  ADD COLUMN IF NOT EXISTS "verified_at" timestamptz;
