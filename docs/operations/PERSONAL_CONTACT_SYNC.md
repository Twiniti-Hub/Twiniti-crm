# Personal contact sync operations

Revision 0.10.55.15 · TWI-1087

Loop personal workspaces can import and refresh Google Contacts and iCloud Contacts. The integration is inbound only. Provider contacts are never modified.

## Deployment order

1. Apply additive migration `0027_personal_contact_sync.sql` to every Development regional database.
2. Deploy API, worker, and web from the same commit.
3. Configure the API and worker services with the same stable `CONTACT_SYNC_ENCRYPTION_KEY`.
4. Enable `CONTACT_SYNC_ENABLED=true` only after every regional schema and service is ready.
5. Complete an authenticated smoke test in a personal workspace. Company workspaces must receive 403/404 and must not display Connected accounts.

The migration makes `contacts.email` nullable and adds organization-scoped connection, source, cursor, run, and OAuth transaction tables under forced RLS. Deploy null-safe readers before allowing phone-only imports. Do not roll the application back to an email-required build after phone-only records exist.

## Google configuration

Create a Google Cloud OAuth web client, enable the People API, configure the consent screen, and add the exact regional/public callback URL:

`https://<loop-host>/api/v1/personal/contact-connections/google/callback`

Set `GOOGLE_CONTACTS_CLIENT_ID`, `GOOGLE_CONTACTS_CLIENT_SECRET`, and `GOOGLE_CONTACTS_REDIRECT_URI` on each regional API. The worker also needs the client ID and secret. Loop requests OpenID email identity and the read-only Contacts scope. Google production verification may be required before broad use.

Google sync uses stable resource names and incremental sync tokens. An expired token causes a full reconciliation; failed or partial fetches never imply deletion.

## iCloud configuration

Users enter their Apple Account email and an app-specific password. Loop never requests the normal Apple Account password. CardDAV discovery and requests are restricted to HTTPS Apple Contacts hosts, use bounded responses/timeouts, reject unsafe XML, and never fetch embedded photo URLs.

Before Production enablement, test discovery, multiple address books, changes, and deletions with an authorized real iCloud account. Fixtures alone are insufficient evidence.

## Secrets and data handling

`CONTACT_SYNC_ENCRYPTION_KEY` must be a stable base64 32-byte AES-GCM key compatible with the existing credential encryption helper. Rotating it requires a planned reconnect or re-encryption migration. Never log OAuth codes, refresh tokens, app-specific passwords, vCards, contact values, or authorization headers.

Credentials, staging, mappings, cursors, and run records stay in the personal workspace's regional database. Jobs contain internal IDs and generation only. Disconnect increments the generation before deleting ciphertext so stale workers cannot commit.

## Monitoring and rollback

Monitor `contacts.sync` queue age, failed runs, reconnect-required connections, and regional worker health. The normal interval is 30 minutes with jitter.

Rollback:
1. Set `CONTACT_SYNC_ENABLED=false`.
2. Allow current reads to finish; generation fencing blocks writes after disconnect.
3. Keep migration 0027 and the null-safe runtime contract.
4. Roll forward with a fix. Do not restore email NOT NULL while phone-only/name-only contacts exist.

Development smoke: connect → preview → import → provider edit → Sync now → local edit preservation → provider deletion → revoke/reconnect → disconnect. Record regional health and the exact commit in Linear.
