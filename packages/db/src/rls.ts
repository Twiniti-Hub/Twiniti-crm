import { sql } from "drizzle-orm";
import { clearDbContext, enterDbContext, type Db } from "./client.js";

export type RlsTransaction = Parameters<Db["transaction"]>[0] extends (tx: infer T) => unknown ? T : never;

/**
 * Runs work inside a transaction with a fail-closed organization RLS context.
 * The caller must provide the authenticated Hexclave subject and organization
 * selected by the authorization layer; PostgreSQL independently verifies that
 * the subject is an active member of that organization for every row.
 */
export async function withOrganizationRls<T>(
  db: Db,
  context: { organizationId: string; hexclaveSubject: string },
  work: (tx: RlsTransaction) => Promise<T>
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE twiniti_app`);
      await tx.execute(sql`select set_config('twiniti.organization_id', ${context.organizationId}, true)`);
      await tx.execute(sql`select set_config('twiniti.hexclave_subject', ${context.hexclaveSubject}, true)`);
      enterDbContext(tx as Db);
      return work(tx);
    });
  } finally {
    clearDbContext();
  }
}

export async function withServiceRls<T>(db: Db, organizationId: string | null, work: (tx: RlsTransaction) => Promise<T>) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE twiniti_app`);
      if (organizationId) await tx.execute(sql`select set_config('twiniti.organization_id', ${organizationId}, true)`);
      await tx.execute(sql`select set_config('twiniti.service_context', 'true', true)`);
      enterDbContext(tx as Db);
      return work(tx);
    });
  } finally {
    clearDbContext();
  }
}
