import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;

export function createDb(connectionString: string): Db {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export function getDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  if (!cached) {
    cached = createDb(connectionString);
  }
  return cached;
}
