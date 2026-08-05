# Organization row-level security

Twiniti CRM uses PostgreSQL RLS as a second isolation boundary below the API.
The `0008_organization_rls.sql` migration enables and forces RLS on every
public table containing `organization_id`.

Before organization-scoped database work, call `withOrganizationRls` with the
authenticated Hexclave subject and organization ID. PostgreSQL permits rows
only when both values are set and the subject is an active member of that
organization. Missing context fails closed and returns no rows; writes are
also rejected.

The context is transaction-local because the Neon HTTP driver does not provide
a persistent session per request. Do not set these values from an unverified
client header, and do not use a connection-level setting for request data.
