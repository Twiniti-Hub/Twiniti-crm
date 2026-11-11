-- TWI-1087: additive personal contact sync foundation and nullable contact email compatibility.
ALTER TABLE "contacts" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "contacts" ALTER COLUMN "email_normalized" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "contact_sync_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "owner_user_id" uuid NOT NULL REFERENCES "crm_users"("id"),
  "provider" varchar(24) NOT NULL,
  "provider_account_id" varchar(500),
  "account_label" varchar(500) NOT NULL,
  "status" varchar(40) DEFAULT 'pending' NOT NULL,
  "selected_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "secret_ciphertext" text,
  "secret_key_version" varchar(40) DEFAULT 'v1' NOT NULL,
  "generation" integer DEFAULT 1 NOT NULL,
  "preview_revision" integer DEFAULT 0 NOT NULL,
  "last_success_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "last_error_code" varchar(80),
  "last_error_message" varchar(500),
  "disconnected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "contact_sync_connections_active_provider_idx" ON "contact_sync_connections" ("organization_id","owner_user_id","provider") WHERE "disconnected_at" IS NULL;
CREATE INDEX IF NOT EXISTS "contact_sync_connections_due_idx" ON "contact_sync_connections" ("status","next_run_at");

CREATE TABLE IF NOT EXISTS "contact_sync_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connection_id" uuid NOT NULL REFERENCES "contact_sync_connections"("id"),
  "contact_id" uuid REFERENCES "contacts"("id"),
  "address_book_key" varchar(500) DEFAULT 'default' NOT NULL,
  "external_id" varchar(1000) NOT NULL,
  "etag" varchar(500),
  "content_hash" varchar(64),
  "disposition" varchar(32) DEFAULT 'pending' NOT NULL,
  "normalized_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "local_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_seen_run_id" uuid,
  "removed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "contact_sync_sources_external_idx" ON "contact_sync_sources" ("connection_id","address_book_key","external_id");
CREATE INDEX IF NOT EXISTS "contact_sync_sources_contact_idx" ON "contact_sync_sources" ("organization_id","contact_id");
CREATE INDEX IF NOT EXISTS "contact_sync_sources_disposition_idx" ON "contact_sync_sources" ("connection_id","disposition");

CREATE TABLE IF NOT EXISTS "contact_sync_cursors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connection_id" uuid NOT NULL REFERENCES "contact_sync_connections"("id"),
  "address_book_key" varchar(500) DEFAULT 'default' NOT NULL,
  "cursor" text,
  "request_fingerprint" varchar(64),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "contact_sync_cursors_connection_book_idx" ON "contact_sync_cursors" ("connection_id","address_book_key");

CREATE TABLE IF NOT EXISTS "contact_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connection_id" uuid NOT NULL REFERENCES "contact_sync_connections"("id"),
  "generation" integer NOT NULL,
  "trigger" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_code" varchar(80),
  "error_message" varchar(500),
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "contact_sync_runs_connection_idx" ON "contact_sync_runs" ("connection_id","created_at");

CREATE TABLE IF NOT EXISTS "contact_sync_oauth_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "owner_user_id" uuid NOT NULL REFERENCES "crm_users"("id"),
  "provider" varchar(24) NOT NULL,
  "state_hash" varchar(64) NOT NULL,
  "code_verifier_ciphertext" text NOT NULL,
  "redirect_uri" varchar(1000) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "contact_sync_oauth_state_idx" ON "contact_sync_oauth_transactions" ("state_hash");

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'contact_sync_connections',
    'contact_sync_sources',
    'contact_sync_cursors',
    'contact_sync_runs',
    'contact_sync_oauth_transactions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (twiniti_organization_isolation(organization_id)) WITH CHECK (twiniti_organization_isolation(organization_id))',
      table_name || '_org_isolation',
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "contact_sync_connections",
  "contact_sync_sources",
  "contact_sync_cursors",
  "contact_sync_runs",
  "contact_sync_oauth_transactions"
TO twiniti_app;
