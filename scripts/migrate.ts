/**
 * Applies drizzle/0000_init.sql. The DDL is idempotent, so running this against
 * an existing database is safe and is the normal way to set up a new one.
 *
 *   npm run db:migrate
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "..", "drizzle", "0000_init.sql"), "utf8");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local, or export it first.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

try {
  await pool.query(sql);
  const { rows } = await pool.query(
    "select (select count(*) from tickets) as tickets, (select count(*) from ticket_events) as events",
  );
  console.log(`Schema applied. ${rows[0].tickets} tickets, ${rows[0].events} events.`);
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
