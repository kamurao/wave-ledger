/**
 * Seeds the board from seed-data/board.json: milestones, epics, then tickets.
 *
 *   npm run db:seed            # insert anything missing, leave the rest alone
 *   npm run db:seed -- --reset # wipe everything first (back up with db:export!)
 *
 * Ticket order in the file is the order in each column, top to bottom.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

type Seed = {
  milestones: {
    id: string;
    name: string;
    goal?: string;
    target_date?: string | null;
    status?: string;
  }[];
  epics: {
    id: string;
    name: string;
    summary?: string;
    color?: string;
    status?: string;
    owner?: string | null;
  }[];
  tickets: {
    id: string;
    title: string;
    kind?: string;
    status?: string;
    assignee?: string | null;
    epic?: string | null;
    milestone?: string | null;
    priority?: string;
    estimate?: string | null;
    labels?: string[];
    depends_on?: string[];
    blocked_reason?: string;
    design_doc?: string;
    criteria?: string;
    decision?: string;
    branch?: string;
    notes?: string;
  }[];
};

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(here, "..", "seed-data", "board.json"), "utf8")) as Seed;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local, or export it first.");
  process.exit(1);
}

const reset = process.argv.includes("--reset");

const pool = new Pool({
  connectionString: url,
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  await client.query("begin");

  if (reset) {
    await client.query("delete from ticket_events");
    await client.query("delete from tickets");
    await client.query("delete from epics");
    await client.query("delete from milestones");
    console.log("Cleared tickets, history, epics and milestones.");
  }

  let m = 0;
  for (const [i, x] of seed.milestones.entries()) {
    const r = await client.query(
      `insert into milestones (id, name, goal, target_date, status, position)
       values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
      [x.id, x.name, x.goal ?? "", x.target_date ?? null, x.status ?? "upcoming", i + 1],
    );
    m += r.rowCount ?? 0;
  }

  let e = 0;
  for (const [i, x] of seed.epics.entries()) {
    const r = await client.query(
      `insert into epics (id, name, summary, color, status, owner, position)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`,
      [x.id, x.name, x.summary ?? "", x.color ?? "e1", x.status ?? "active", x.owner ?? null, i + 1],
    );
    e += r.rowCount ?? 0;
  }

  // Dependencies point at other tickets, so they go in once every row exists.
  let t = 0;
  for (const [i, x] of seed.tickets.entries()) {
    const r = await client.query(
      `insert into tickets
         (id, title, kind, status, assignee, epic_id, milestone_id, priority, estimate, labels,
          blocked_reason, design_doc, criteria, decision, branch, notes, rank)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (id) do nothing returning id`,
      [
        x.id,
        x.title,
        x.kind ?? "feature",
        x.status ?? "backlog",
        x.assignee ?? null,
        x.epic ?? null,
        x.milestone ?? null,
        x.priority ?? "p2",
        x.estimate ?? null,
        x.labels ?? [],
        x.blocked_reason ?? "",
        x.design_doc ?? "",
        x.criteria ?? "",
        x.decision ?? "",
        x.branch ?? "",
        x.notes ?? "",
        (i + 1) * 1000,
      ],
    );
    if (r.rowCount) {
      t += 1;
      await client.query(
        "insert into ticket_events (ticket_id, actor, text) values ($1,'claude','created (seed)')",
        [x.id],
      );
    }
  }
  for (const x of seed.tickets) {
    if (x.depends_on?.length) {
      await client.query("update tickets set depends_on = $2 where id = $1", [x.id, x.depends_on]);
    }
  }

  await client.query("commit");
  console.log(`Seeded ${m} milestones, ${e} epics and ${t} tickets.`);
} catch (err) {
  await client.query("rollback");
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
