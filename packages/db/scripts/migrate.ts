import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString, max: 1 });
try {
  const db = drizzle(pool);
  await migrate(db, {
    migrationsFolder: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle")
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
