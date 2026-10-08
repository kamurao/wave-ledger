/**
 * Empties the board.
 *
 *   npm run db:clear-tickets -- --yes          # tickets and their history; epics and milestones stay
 *   npm run db:clear-tickets -- --yes --all    # tickets, epics and milestones: a blank board
 *
 * Refuses to run without --yes, and prints what it is about to remove first.
 * Run `npm run db:export` before this.
 */
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local, or export it first.");
  process.exit(1);
}

const all = process.argv.includes("--all");
const pool = new Pool({
  connectionString: url,
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(
    `select (select count(*) from tickets) as tickets, (select count(*) from ticket_events) as events,
            (select count(*) from epics) as epics, (select count(*) from milestones) as milestones`,
  );
  const r = rows[0];
  console.log(
    `This board holds ${r.tickets} tickets, ${r.events} history events, ${r.epics} epics and ${r.milestones} milestones.`,
  );
  if (!process.argv.includes("--yes")) {
    console.log(`Nothing deleted. Re-run with --yes to remove ${all ? "all of it" : "the tickets (epics and milestones stay)"}.`);
  } else {
    await pool.query("delete from tickets"); // history cascades
    if (all) {
      await pool.query("delete from epics");
      await pool.query("delete from milestones");
    }
    console.log(all ? "Deleted everything. The board is blank." : "Deleted every ticket. Epics and milestones are untouched.");
  }
} catch (err) {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
