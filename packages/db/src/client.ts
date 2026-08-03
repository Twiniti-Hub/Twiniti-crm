import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export type Db = NeonHttpDatabase<typeof schema>;

const cached = new Map<string, Db>();

export function createDb(connectionString: string): Db {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export function getDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const existing = cached.get(connectionString);
  if (existing) return existing;
  const db = createDb(connectionString);
  cached.set(connectionString, db);
  return db;
}
