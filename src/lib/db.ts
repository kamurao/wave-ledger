import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

declare global {
  // Reused across hot reloads in dev and warm invocations in serverless.
  var __waveLedgerDb: { pool: Pool; db: DB } | undefined;
}

function connect(): { pool: Pool; db: DB } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Neon, Vercel Postgres and Supabase all terminate TLS with a chain Node
    // ships no root for; the connection is still encrypted.
    ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });
  return { pool, db: drizzle(pool, { schema }) };
}

function real(): DB {
  if (!globalThis.__waveLedgerDb) globalThis.__waveLedgerDb = connect();
  return globalThis.__waveLedgerDb.db;
}

/**
 * Connects on first query, not on import.
 *
 * `next build` loads every route module to read its config, so a pool created at
 * module scope would make the build depend on DATABASE_URL being present.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(real() as object, prop, receiver);
  },
});
