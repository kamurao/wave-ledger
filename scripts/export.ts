/**
 * Dumps the whole board to one JSON file: tickets, their history, epics and
 * milestones. Run it before anything destructive.
 *
 *   npm run db:export                       # -> seed-data/archive/export-<date>.json
 *   npm run db:export -- path/to/file.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local, or export it first.");
  process.exit(1);
}

const out = process.argv[2]
  ? resolve(process.argv[2])
  : join(here, "..", "seed-data", "archive", `export-${new Date().toISOString().slice(0, 10)}.json`);

const pool = new Pool({
  connectionString: url,
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

async function maybe(sql: string) {
  try {
    return (await pool.query(sql)).rows;
  } catch {
    return []; // table not created yet, i.e. before the game-design migration
  }
}

try {
  const tickets = (await pool.query("select * from tickets order by created_at, id")).rows;
  const events = (await pool.query("select * from ticket_events order by id")).rows;
  const epics = await maybe("select * from epics order by position, created_at");
  const milestones = await maybe("select * from milestones order by position, created_at");

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify({ exported_at: new Date().toISOString(), tickets, events, epics, milestones }, null, 2) + "\n",
  );
  console.log(
    `Wrote ${out}: ${tickets.length} tickets, ${events.length} events, ${epics.length} epics, ${milestones.length} milestones.`,
  );
} catch (err) {
  console.error("Export failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
