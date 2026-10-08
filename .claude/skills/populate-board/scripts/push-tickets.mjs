#!/usr/bin/env node
/**
 * Validates a file of proposed tickets against the live Wave Ledger board and,
 * with --apply, writes them.
 *
 *   node push-tickets.mjs proposals.json            # dry run: validate and show the plan
 *   node push-tickets.mjs proposals.json --apply    # actually create them
 *
 * Input: { "tickets": [ { title, kind, epic, milestone, priority, estimate,
 *   labels, depends_on, criteria, decision, notes, source, design_doc, id, status } ] }
 *   - `epic` / `milestone` are ids (e-towers, m-prototype) or exact names.
 *   - `depends_on` entries are the `id` or the exact `title` of another proposal
 *     in the same file, or the id of a ticket already on the board.
 *   - `criteria` is an array of strings or a "- [ ] ..." block.
 *   - `source` (where in the design document this came from) is appended to notes.
 *   - `status` defaults to "backlog". in_progress and done need --allow-status.
 *
 * Env: WAVE_LEDGER_TOKEN (or a .env.local that defines it, found by walking up
 * from the current directory), WAVE_LEDGER_URL (default https://wave-ledger.vercel.app).
 *
 * Nothing is deleted or overwritten. A proposal whose id or exact title already
 * exists on the board is skipped and reported.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const allowStatus = args.includes("--allow-status");
const allowDupes = args.includes("--allow-duplicates");

if (!file) {
  console.error("usage: node push-tickets.mjs proposals.json [--apply] [--allow-status] [--allow-duplicates]");
  process.exit(2);
}

const base = (process.env.WAVE_LEDGER_URL ?? "https://wave-ledger.vercel.app").replace(/\/$/, "");

function findToken() {
  if (process.env.WAVE_LEDGER_TOKEN) return process.env.WAVE_LEDGER_TOKEN.split(",")[0].trim();
  let dir = process.cwd();
  for (;;) {
    const p = join(dir, ".env.local");
    if (existsSync(p)) {
      const m = /^WAVE_LEDGER_TOKEN="?([^"\r\n]+)"?/m.exec(readFileSync(p, "utf8"));
      if (m) return m[1].split(",")[0].trim();
    }
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const token = findToken();
if (apply && !token) {
  console.error("No WAVE_LEDGER_TOKEN in the environment or in a .env.local. Writes need it.");
  process.exit(2);
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

const slug = (title) => {
  const s = title
    .toLowerCase()
    .replace(/\*\*/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s ? `t-${s}` : null;
};
const words = (t) => new Set(t.toLowerCase().replace(/\*\*/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2));
const jaccard = (a, b) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
};

// ---- load -------------------------------------------------------------------
const input = JSON.parse(readFileSync(resolve(file), "utf8"));
const proposals = Array.isArray(input) ? input : input.tickets;
if (!Array.isArray(proposals) || proposals.length === 0) {
  console.error("The file has no tickets array.");
  process.exit(2);
}

const board = await call("GET", "/api/board");
if (board.status !== 200) {
  console.error(`Could not read the board (${board.status}): ${JSON.stringify(board.json)}`);
  process.exit(1);
}
const { tickets: existing, epics, milestones, meta } = board.json;

const resolveContainer = (list, v) => {
  if (v === undefined || v === null || v === "") return { id: null };
  const s = String(v).trim();
  const hit = list.find((x) => x.id === s) ?? list.find((x) => x.name.toLowerCase() === s.toLowerCase());
  return hit ? { id: hit.id } : { error: `"${s}"` };
};

// ---- validate and normalise ------------------------------------------------
const problems = [];
const warnings = [];
const skipped = [];
const plan = [];
const usedIds = new Set(existing.map((t) => t.id));
const existingTitles = new Map(existing.map((t) => [t.title.toLowerCase().replace(/\*\*/g, ""), t.id]));

for (const [i, p] of proposals.entries()) {
  const label = `#${i + 1} ${(p.title ?? "(no title)").slice(0, 60)}`;
  const err = (m) => problems.push(`${label}: ${m}`);

  const title = String(p.title ?? "").trim();
  if (!title) {
    err("missing title");
    continue;
  }
  if (title.length > 300) err("title is over 300 characters");

  const id = (p.id ? String(p.id).trim() : slug(title)) ?? "";
  if (!/^[A-Za-z0-9._~-]{1,200}$/.test(id)) err(`bad id "${id}"`);

  const clean = title.toLowerCase().replace(/\*\*/g, "");
  if (usedIds.has(id)) {
    skipped.push(`${label}: id ${id} already exists`);
    continue;
  }
  if (!allowDupes && existingTitles.has(clean)) {
    skipped.push(`${label}: same title as ${existingTitles.get(clean)}`);
    continue;
  }
  if (!allowDupes) {
    const near = existing.find((t) => jaccard(t.title, title) >= 0.8);
    if (near) warnings.push(`${label}: looks like existing ${near.id} ("${near.title.slice(0, 50)}")`);
  }
  usedIds.add(id);

  const kind = p.kind ?? "feature";
  if (!meta.kinds.some((k) => k.id === kind)) err(`unknown kind "${kind}" (${meta.kinds.map((k) => k.id).join(", ")})`);

  const status = p.status ?? "backlog";
  if (!meta.statuses.some((s) => s.id === status)) err(`unknown status "${status}"`);
  if ((status === "in_progress" || status === "done") && !allowStatus) {
    err(`status ${status} needs --allow-status. New tickets should land in backlog or todo.`);
  }

  const priority = p.priority ?? "p2";
  if (!meta.priorities.some((x) => x.id === priority)) err(`unknown priority "${priority}"`);
  const estimate = p.estimate ?? null;
  if (estimate !== null && !meta.estimates.includes(estimate)) err(`unknown estimate "${estimate}"`);

  const epic = resolveContainer(epics, p.epic ?? p.epic_id);
  if (epic.error) err(`no epic ${epic.error}`);
  const milestone = resolveContainer(milestones, p.milestone ?? p.milestone_id);
  if (milestone.error) err(`no milestone ${milestone.error}`);
  if (!epic.id && !epic.error) warnings.push(`${label}: no epic`);

  const labels = (p.labels ?? []).map((l) => String(l).trim().toLowerCase().replace(/\s+/g, "-"));

  let criteria = "";
  if (Array.isArray(p.criteria)) criteria = p.criteria.map((c) => `- [ ] ${String(c).replace(/^- \[[ x]\]\s*/, "")}`).join("\n");
  else if (p.criteria) criteria = String(p.criteria);
  if (kind !== "question" && !criteria) warnings.push(`${label}: no acceptance criteria`);
  if (p.decision && status !== "done") warnings.push(`${label}: has a decision but is not done`);

  const notes = [p.notes, p.source ? `Source: ${p.source}` : null].filter(Boolean).join("\n\n");

  plan.push({
    ref: { id, title: clean },
    depends_on: p.depends_on ?? [],
    body: {
      id,
      title,
      kind,
      status,
      priority,
      estimate,
      epic_id: epic.id,
      milestone_id: milestone.id,
      labels,
      criteria,
      decision: p.decision ?? "",
      design_doc: p.design_doc ?? "",
      notes,
    },
  });
}

// dependencies resolve against this file first, then the board
const byRef = new Map();
for (const x of plan) {
  byRef.set(x.ref.id, x.ref.id);
  byRef.set(x.ref.title, x.ref.id);
}
const onBoard = new Set(existing.map((t) => t.id));
for (const x of plan) {
  x.deps = [];
  for (const d of x.depends_on) {
    const s = String(d).trim();
    const hit = byRef.get(s) ?? byRef.get(s.toLowerCase().replace(/\*\*/g, "")) ?? (onBoard.has(s) ? s : null);
    if (!hit) problems.push(`${x.body.title.slice(0, 60)}: depends_on "${s}" matches no proposal or ticket`);
    else if (hit === x.body.id) problems.push(`${x.body.title.slice(0, 60)}: depends on itself`);
    else if (!x.deps.includes(hit)) x.deps.push(hit);
  }
}

// ---- report -----------------------------------------------------------------
const tally = (key) => {
  const m = {};
  for (const x of plan) m[x.body[key] ?? "(none)"] = (m[x.body[key] ?? "(none)"] ?? 0) + 1;
  return Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(", ");
};
console.log(`${apply ? "APPLY" : "DRY RUN"} against ${base}`);
console.log(`${proposals.length} proposed, ${plan.length} to create, ${skipped.length} skipped`);
if (plan.length) {
  console.log(`  by epic:      ${tally("epic_id")}`);
  console.log(`  by milestone: ${tally("milestone_id")}`);
  console.log(`  by priority:  ${tally("priority")}`);
  console.log(`  by kind:      ${tally("kind")}`);
}
for (const s of skipped) console.log(`SKIP  ${s}`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const p of problems) console.log(`ERROR ${p}`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s). Nothing was written. Fix the file and run again.`);
  process.exit(1);
}
if (!apply) {
  console.log("\nDry run only. Re-run with --apply to create these tickets.");
  process.exit(0);
}

// ---- write: create everything, then wire dependencies ----------------------
const created = [];
const failed = [];
for (const x of plan) {
  const r = await call("POST", "/api/tickets", { ...x.body, by: undefined });
  if (r.status === 201) {
    created.push({ id: x.body.id, version: r.json.ticket.version });
  } else {
    failed.push(`${x.body.id}: ${r.status} ${r.json.error ?? ""}`);
  }
}

let wired = 0;
for (const x of plan) {
  const mine = created.find((c) => c.id === x.body.id);
  if (!mine || x.deps.length === 0) continue;
  const live = x.deps.filter((d) => created.some((c) => c.id === d) || onBoard.has(d));
  if (live.length === 0) continue;
  const r = await call("PATCH", `/api/tickets/${encodeURIComponent(x.body.id)}`, { depends_on: live }, {
    "if-match-version": String(mine.version),
  });
  if (r.status === 200) wired += 1;
  else failed.push(`${x.body.id} depends_on: ${r.status} ${r.json.error ?? ""}`);
}

const log = {
  at: new Date().toISOString(),
  base,
  created: created.map((c) => c.id),
  failed,
};
const logPath = resolve(file).replace(/\.json$/, "") + ".result.json";
writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");

console.log(`\nCreated ${created.length} of ${plan.length} tickets, wired dependencies on ${wired}.`);
if (failed.length) {
  console.log(`${failed.length} failure(s):`);
  for (const f of failed) console.log(`  ${f}`);
}
console.log(`Result log: ${logPath}`);
process.exit(failed.length ? 1 : 0);
