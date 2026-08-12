import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: path.resolve(packageDir, "../..", ".env") });
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString, max: 1 });
try {
  const db = drizzle(pool);
  const ledger = await pool.query(
    `SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ledger_exists`
  );
  if (ledger.rows[0]?.ledger_exists) {
    // Legacy reconciliation can insert ledger IDs without advancing the serial sequence.
    await pool.query(`SELECT setval(
      pg_get_serial_sequence('drizzle.__drizzle_migrations', 'id'),
      COALESCE((SELECT MAX(id) FROM drizzle.__drizzle_migrations), 1),
      EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations)
    )`);
  }
  await migrate(db, {
    migrationsFolder: path.resolve(packageDir, "drizzle")
  });
  console.log("Database migrations applied successfully");
} catch (error) {
  const detail = error instanceof Error
    ? { name: error.name, message: error.message, cause: error.cause }
    : { error };
  console.error("Database migration failed", detail);
  throw error;
} finally {
  await pool.end();
}
