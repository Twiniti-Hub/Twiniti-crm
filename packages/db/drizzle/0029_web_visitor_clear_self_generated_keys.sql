-- TWI-1115: Loop must not invent the Web Visitors script ID. Clear values the provider never issued:
-- retired self-generated keys (wvi_) and any stored value that is actually this row's private webhook
-- token (its SHA-256 matches webhook_token_hash). The comparison stays inside SQL; nothing is returned.
UPDATE "web_visitor_integrations"
SET "settings" = COALESCE("settings", '{}'::jsonb) - 'publicKey',
"updated_at" = now()
WHERE "settings"->>'publicKey' IS NOT NULL
  AND (
    "settings"->>'publicKey' LIKE 'wvi\_%'
    OR encode(sha256(convert_to("settings"->>'publicKey', 'UTF8')), 'hex') = "webhook_token_hash"
  );
