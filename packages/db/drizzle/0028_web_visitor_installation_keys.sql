-- TWI-1111: generate a distinct public installation key without exposing the private webhook credential.
UPDATE "web_visitor_integrations"
SET "settings" = jsonb_set(
  COALESCE("settings", '{}'::jsonb),
  '{publicKey}',
  to_jsonb('wvi_' || replace(gen_random_uuid()::text, '-', '')),
  true
),
"updated_at" = now()
WHERE NULLIF("settings"->>'publicKey', '') IS NULL;
