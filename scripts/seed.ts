/**
 * Seeds from the artifact export in seed-data/tickets/.
 *
 * Each file is one document as the old board stored it. The only transforms are
 * `history` array -> ticket_events rows, and ISO strings -> timestamptz. Field
 * names match one to one.
 *
 *   npm run db:seed            # insert anything missing, leave the rest alone
 *   npm run db:seed -- --reset # wipe both tables first
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

type HistoryEntry = { at?: string; by?: string; text?: string };
type Exported = {
  title?: string;
  kind?: string;
  status?: string;
  assignee?: string | null;
  section?: string;
  branch?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  history?: HistoryEntry[];
};

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "seed-data", "tickets");

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

function iso(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

const client = await pool.connect();
try {
  await client.query("begin");

  if (reset) {
    await client.query("delete from ticket_events");
    await client.query("delete from tickets");
    console.log("Cleared both tables.");
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  let inserted = 0;
  let skipped = 0;
  let events = 0;

  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const doc = JSON.parse(readFileSync(join(dir, file), "utf8")) as Exported;
    const now = new Date().toISOString();
    const createdAt = iso(doc.created_at, now);

    const res = await client.query(
      `insert into tickets
         (id, title, kind, status, assignee, section, branch, notes, created_at, updated_at, version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)
       on conflict (id) do nothing
       returning id`,
      [
        id,
        String(doc.title ?? id),
        doc.kind === "question" ? "question" : "feature",
        doc.status === "in_progress" || doc.status === "done" ? doc.status : "todo",
        doc.assignee || null,
        doc.section ?? "Unsorted",
        doc.branch ?? "",
        doc.notes ?? "",
        createdAt,
        iso(doc.updated_at, createdAt),
      ],
    );

    if (res.rowCount === 0) {
      skipped += 1;
      continue;
    }
    inserted += 1;

    // Oldest first, so bigserial ids run in the same order as the timestamps and
    // the Activity tab's keyset paging stays in step with `at`.
    const history = Array.isArray(doc.history) ? [...doc.history] : [];
    history.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
    for (const h of history) {
      await client.query(
        "insert into ticket_events (ticket_id, at, actor, text) values ($1,$2,$3,$4)",
        [id, iso(h.at, createdAt), String(h.by ?? "claude"), String(h.text ?? "changed")],
      );
      events += 1;
    }
  }

  await client.query("commit");
  console.log(
    `Seeded ${inserted} tickets and ${events} events from ${files.length} files` +
      (skipped ? `, skipped ${skipped} that already existed.` : "."),
  );
} catch (err) {
  await client.query("rollback");
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
