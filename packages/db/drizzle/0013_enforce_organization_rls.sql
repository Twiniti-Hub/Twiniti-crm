CREATE OR REPLACE FUNCTION twiniti_current_organization_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('twiniti.organization_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION twiniti_current_subject()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('twiniti.hexclave_subject', true), '')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION twiniti_is_active_member(candidate_organization_id uuid, candidate_subject text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_users member
    WHERE member.organization_id = candidate_organization_id
      AND member.hexclave_subject = candidate_subject AND member.active = true
  ) OR EXISTS (
    SELECT 1 FROM public.agent_identities agent
    WHERE agent.organization_id = candidate_organization_id
      AND agent.id::text = candidate_subject AND agent.revoked_at IS NULL
      AND (agent.expires_at IS NULL OR agent.expires_at > CURRENT_TIMESTAMP)
  )
$$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOR table_name IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS twiniti_organization_isolation ON public.%I', table_name);
    EXECUTE format($policy$
      CREATE POLICY twiniti_organization_isolation ON public.%I
      USING (
        current_setting('twiniti.service_context', true) = 'true'
        OR (twiniti_current_organization_id() IS NOT NULL
        AND %I.organization_id = twiniti_current_organization_id()
        AND twiniti_is_active_member(%I.organization_id, twiniti_current_subject()))
      )
      WITH CHECK (
        current_setting('twiniti.service_context', true) = 'true'
        OR (twiniti_current_organization_id() IS NOT NULL
        AND %I.organization_id = twiniti_current_organization_id()
        AND twiniti_is_active_member(%I.organization_id, twiniti_current_subject()))
      )
    $policy$, table_name, table_name, table_name, table_name, table_name);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'twiniti_app') THEN
    CREATE ROLE twiniti_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
ALTER ROLE twiniti_app NOBYPASSRLS;
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
END $$;
COMMENT ON FUNCTION twiniti_current_organization_id() IS 'Fail-closed RLS context set by withOrganizationRls; never trust client input without membership verification.';
COMMENT ON FUNCTION twiniti_current_subject() IS 'Hexclave subject used by organization RLS membership policies.';
COMMENT ON FUNCTION twiniti_is_active_member(uuid, text) IS 'Security-definer membership check used by organization RLS policies to avoid recursive crm_users policy evaluation.';
