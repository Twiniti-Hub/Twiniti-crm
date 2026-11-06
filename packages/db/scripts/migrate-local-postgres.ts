import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  const db = drizzle(pool);
  await migrate(db, {
    migrationsFolder: path.resolve(packageDir, "drizzle")
  });
  console.log("Database migrations applied successfully");
} finally {
  await pool.end();
}
