import { sql } from "drizzle-orm";
import type { Pool } from "@neondatabase/serverless";
import {
  createDbFromConnection,
  enterDbContext,
  getDbContext,
  restoreDbContext,
  type Db
} from "./client.js";

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
  const previous = getDbContext();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE twiniti_app`);
      await tx.execute(sql`select set_config('twiniti.organization_id', ${context.organizationId}, true)`);
      await tx.execute(sql`select set_config('twiniti.hexclave_subject', ${context.hexclaveSubject}, true)`);
      enterDbContext(tx as Db);
      return work(tx);
    });
  } finally {
    restoreDbContext(previous);
  }
}

export async function withServiceRls<T>(db: Db, organizationId: string | null, work: (tx: RlsTransaction) => Promise<T>) {
  const previous = getDbContext();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE twiniti_app`);
      if (organizationId) await tx.execute(sql`select set_config('twiniti.organization_id', ${organizationId}, true)`);
      await tx.execute(sql`select set_config('twiniti.service_context', 'true', true)`);
      enterDbContext(tx as Db);
      return work(tx);
    });
  } finally {
    restoreDbContext(previous);
  }
}

/**
 * Fresh-pool service context that does not nest inside / mutate an active
 * tenant RLS transaction. Use for cross-workspace provisioning (create a second
 * org, accept an invite into another org) while a request already holds
 * `twiniti_app` scoped to the current membership. Callers must pass the
 * returned db into repositories; do not rely on scopedDb ALS.
 */
export async function withIsolatedServiceRls<T>(
  pool: Pool,
  organizationId: string | null,
  work: (db: Db) => Promise<T>
): Promise<T> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL ROLE twiniti_app");
    if (organizationId) {
      await connection.query("select set_config('twiniti.organization_id', $1, true)", [organizationId]);
    }
    await connection.query("select set_config('twiniti.service_context', $1, true)", ["true"]);
    const txDb = createDbFromConnection(connection);
    const result = await work(txDb);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      // Connection may already be aborted; release still runs.
    }
    throw error;
  } finally {
    connection.release();
  }
}
