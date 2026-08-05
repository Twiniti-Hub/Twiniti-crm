import { Pool, type PoolClient } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema.js";

export type Db = NeonDatabase<typeof schema>;
export type DbConnection = Pool | PoolClient;
export type DbPool = Pool;

const cached = new Map<string, { pool: Pool; db: Db }>();
const requestDb = new AsyncLocalStorage<Db>();

export function createDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 10 });
  return drizzle(pool, { schema });
}

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

export function getPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const existing = cached.get(connectionString);
  if (existing) return existing.pool;
  const pool = createPool(connectionString);
  const db = drizzle(pool, { schema });
  cached.set(connectionString, { pool, db });
  return pool;
}

export function createDbFromConnection(connection: DbConnection): Db {
  return drizzle(connection, { schema });
}

/** Returns the current request transaction, or the base database outside a request. */
export function scopedDb(baseDb: Db): Db {
  return new Proxy(baseDb, {
    get(target, property, receiver) {
      const active = requestDb.getStore() ?? target;
      const value = Reflect.get(active, property, receiver);
      return typeof value === "function" ? value.bind(active) : value;
    }
  }) as Db;
}

export function enterDbContext(db: Db) {
  requestDb.enterWith(db);
}

export function clearDbContext() {
  requestDb.enterWith(undefined as unknown as Db);
}

export async function beginOrganizationRlsTransaction(
  pool: Pool,
  context: { organizationId: string; hexclaveSubject: string }
) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL ROLE twiniti_app");
    await connection.query("select set_config('twiniti.organization_id', $1, true)", [context.organizationId]);
    await connection.query("select set_config('twiniti.hexclave_subject', $1, true)", [context.hexclaveSubject]);
    const transactionDb = createDbFromConnection(connection);
    return {
      db: transactionDb,
      enter: () => requestDb.enterWith(transactionDb),
      commit: async () => { await connection.query("COMMIT"); },
      rollback: async () => { await connection.query("ROLLBACK"); },
      release: () => connection.release()
    };
  } catch (error) {
    connection.release();
    throw error;
  }
}

export function getDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const existing = cached.get(connectionString);
  if (existing) return existing.db;
  const pool = createPool(connectionString);
  const db = drizzle(pool, { schema });
  cached.set(connectionString, { pool, db });
  return db;
}

export async function closeDbPools() {
  await Promise.all([...cached.values()].map(({ pool }) => pool.end()));
  cached.clear();
}
