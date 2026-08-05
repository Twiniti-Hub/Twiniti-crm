CREATE TABLE IF NOT EXISTS "organization_resend_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "domain" varchar(255) NOT NULL,
  "api_key_ciphertext" text NOT NULL,
  "webhook_secret_ciphertext" text,
  "resend_domain_id" varchar(255),
  "from_email" varchar(320) NOT NULL,
  "from_name" varchar(200),
  "verification_status" varchar(32) DEFAULT 'unverified' NOT NULL,
  "verified_at" timestamptz,
  "is_default" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_validated_at" timestamptz,
  "rotated_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_resend_domains_org_domain_idx" ON "organization_resend_domains" ("organization_id", "domain");
CREATE INDEX IF NOT EXISTS "organization_resend_domains_org_idx" ON "organization_resend_domains" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "organization_resend_domains_default_idx" ON "organization_resend_domains" ("organization_id") WHERE "is_default" = true AND "active" = true;
