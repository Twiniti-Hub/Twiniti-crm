-- Classification: additive / expand
-- Allow one Hexclave subject to hold memberships in multiple organizations
-- (one personal + N company). Existing rows already satisfy the new unique
-- (hexclave_subject, organization_id) constraint. At most one personal
-- membership per subject is enforced by personal provisioning keys
-- (`twiniti-crm:user:<subject>:personal`) plus application guards (no invites
-- into personal workspaces). Compatible with the currently deployed app.

CREATE UNIQUE INDEX IF NOT EXISTS "crm_users_subject_org_idx"
  ON "crm_users" USING btree ("hexclave_subject", "organization_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "crm_users_subject_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_users_subject_idx"
  ON "crm_users" USING btree ("hexclave_subject");
