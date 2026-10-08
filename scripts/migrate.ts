/**
 * Applies every drizzle/*.sql file in name order. The DDL is idempotent, so
 * running this against an existing database is safe and is the normal way to
 * set up a new one or bring an old one forward.
 *
 *   npm run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "drizzle");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

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
  for (const f of files) {
    await pool.query(readFileSync(join(dir, f), "utf8"));
    console.log(`Applied ${f}`);
  }
  const { rows } = await pool.query(
    `select (select count(*) from tickets) as tickets,
            (select count(*) from ticket_events) as events,
            (select count(*) from epics) as epics,
            (select count(*) from milestones) as milestones`,
  );
  const r = rows[0];
  console.log(
    `Schema up to date. ${r.tickets} tickets, ${r.events} events, ${r.epics} epics, ${r.milestones} milestones.`,
  );
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
