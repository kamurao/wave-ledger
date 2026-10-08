import { and, asc, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  isEstimate,
  isKind,
  isPriority,
  isStatus,
  statusLabel,
  type Estimate,
  type Priority,
} from "./constants";
import { randomId, slugId } from "./ids";
import {
  epics,
  milestones,
  ticketEvents,
  tickets,
  type TicketEventRow,
  type TicketRow,
} from "./schema";
import type { ActivityRow, Ticket, TicketEvent } from "./types";

export function serializeTicket(r: TicketRow): Ticket {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    kind: isKind(r.kind) ? r.kind : "feature",
    status: isStatus(r.status) ? r.status : "todo",
    assignee: r.assignee,
    epic_id: r.epicId,
    milestone_id: r.milestoneId,
    priority: isPriority(r.priority) ? r.priority : "p2",
    estimate: isEstimate(r.estimate) ? r.estimate : null,
    labels: r.labels ?? [],
    depends_on: r.dependsOn ?? [],
    blocked_reason: r.blockedReason,
    design_doc: r.designDoc,
    criteria: r.criteria,
    decision: r.decision,
    branch: r.branch,
    notes: r.notes,
    rank: r.rank,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    version: r.version,
  };
}

export function serializeEvent(r: TicketEventRow): TicketEvent {
  return {
    id: Number(r.id),
    ticket_id: r.ticketId,
    at: r.at.toISOString(),
    actor: r.actor,
    text: r.text,
  };
}

export type TicketFilters = {
  status?: string;
  assignee?: string;
  q?: string;
  /** An epic id, or `__none` for tickets without one. */
  epic?: string;
  milestone?: string;
  priority?: string;
  kind?: string;
  label?: string;
};

export async function listTickets(f: TicketFilters = {}): Promise<Ticket[]> {
  const where = [];
  if (f.status && isStatus(f.status)) where.push(eq(tickets.status, f.status));
  if (f.kind && isKind(f.kind)) where.push(eq(tickets.kind, f.kind));
  if (f.priority && isPriority(f.priority)) where.push(eq(tickets.priority, f.priority));
  if (f.assignee === "__none") where.push(sql`${tickets.assignee} is null`);
  else if (f.assignee) where.push(eq(tickets.assignee, f.assignee));
  if (f.epic === "__none") where.push(sql`${tickets.epicId} is null`);
  else if (f.epic) where.push(eq(tickets.epicId, f.epic));
  if (f.milestone === "__none") where.push(sql`${tickets.milestoneId} is null`);
  else if (f.milestone) where.push(eq(tickets.milestoneId, f.milestone));
  if (f.label) where.push(sql`${f.label.toLowerCase()} = any(${tickets.labels})`);
  if (f.q) {
    const pat = `%${f.q}%`;
    where.push(
      or(
        ilike(tickets.title, pat),
        ilike(tickets.notes, pat),
        ilike(tickets.branch, pat),
        ilike(tickets.decision, pat),
        sql`('#' || ${tickets.number}::text) ilike ${pat}`,
      )!,
    );
  }
  const rows = await db
    .select()
    .from(tickets)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(tickets.rank), desc(tickets.updatedAt));
  return rows.map(serializeTicket);
}

/**
 * Turns whatever a person or agent typed into a ticket id: a slug (`t-frost-tower`),
 * a number (`12`), or a number with its hash (`#12`). An exact id wins over a
 * number, so a ticket someone explicitly gave the id "12" is still reachable.
 * Returns the input unchanged when nothing matches, so callers 404 as before.
 */
export async function resolveTicketId(ref: string): Promise<string> {
  const raw = decodeURIComponent(ref).trim();
  const digits = /^#?(\d{1,9})$/.exec(raw)?.[1];
  if (!digits) return raw;
  const [byId] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, raw)).limit(1);
  if (byId) return byId.id;
  const [byNumber] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.number, Number(digits)))
    .limit(1);
  return byNumber?.id ?? raw;
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return row ? serializeTicket(row) : null;
}

export async function getEvents(ticketId: string): Promise<TicketEvent[]> {
  const rows = await db
    .select()
    .from(ticketEvents)
    .where(eq(ticketEvents.ticketId, ticketId))
    .orderBy(desc(ticketEvents.at), desc(ticketEvents.id));
  return rows.map(serializeEvent);
}

/**
 * The Activity tab. Pages with a keyset cursor rather than an offset, so a write
 * landing mid-scroll cannot duplicate or skip a row.
 */
export async function listActivity(opts: { limit?: number; before?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const where = opts.before ? lt(ticketEvents.id, opts.before) : undefined;
  const rows = await db
    .select({
      id: ticketEvents.id,
      ticketId: ticketEvents.ticketId,
      at: ticketEvents.at,
      actor: ticketEvents.actor,
      text: ticketEvents.text,
      title: tickets.title,
    })
    .from(ticketEvents)
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .where(where)
    .orderBy(desc(ticketEvents.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const events: ActivityRow[] = rows.slice(0, limit).map((r) => ({
    id: Number(r.id),
    ticket_id: r.ticketId,
    at: r.at.toISOString(),
    actor: r.actor,
    text: r.text,
    title: r.title,
  }));
  return { events, nextCursor: hasMore ? events[events.length - 1].id : null };
}

export async function appendEvent(ticketId: string, actor: string, text: string) {
  await db.insert(ticketEvents).values({ ticketId, actor, text: text.slice(0, 1000) });
}

/** Rewrites one history line's text. The id, time and actor stay as they were. */
export async function updateEventText(
  ticketId: string,
  eventId: number,
  text: string,
): Promise<TicketEvent | null> {
  const rows = await db
    .update(ticketEvents)
    .set({ text: text.slice(0, 1000) })
    .where(and(eq(ticketEvents.id, eventId), eq(ticketEvents.ticketId, ticketId)))
    .returning();
  return rows[0] ? serializeEvent(rows[0]) : null;
}

/** Removes one history line. Scoped to the ticket, so a wrong pairing deletes nothing. */
export async function deleteEvent(ticketId: string, eventId: number): Promise<boolean> {
  const rows = await db
    .delete(ticketEvents)
    .where(and(eq(ticketEvents.id, eventId), eq(ticketEvents.ticketId, ticketId)))
    .returning({ id: ticketEvents.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Field validation, shared by create and patch.
// ---------------------------------------------------------------------------

/** Loose on purpose: this is the wire shape, and `buildSet` is what polices it. */
export type TicketInput = Record<string, unknown> & { id?: string | null; title?: string };
export type Patch = Record<string, unknown>;

const LABEL_RE = /^[a-z0-9][a-z0-9._:/-]{0,31}$/;

/** Accepts `["a","b"]` or `"a, b"`. Returns null when something is malformed. */
function toList(v: unknown): string[] | null {
  const items = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : null;
  if (!items) return null;
  const out: string[] = [];
  for (const raw of items) {
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

const FIELD_NAMES: Record<string, string> = {
  epicId: "epic",
  milestoneId: "milestone",
  dependsOn: "depends_on",
  blockedReason: "blocked_reason",
  designDoc: "design_doc",
};

type Built = { ok: true; set: Record<string, unknown> } | { ok: false; message: string };

/**
 * Turns a wire-shaped body into drizzle column values, validating as it goes.
 * Only keys that are present are returned, so the same function serves a
 * partial PATCH and a full create. Keys use the columns' camelCase names.
 */
async function buildSet(raw: Record<string, unknown>, selfId?: string): Promise<Built> {
  const set: Record<string, unknown> = {};
  const text = (v: unknown) => (v == null ? "" : String(v));

  if (raw.title !== undefined) {
    const t = text(raw.title).trim();
    if (!t) return { ok: false, message: "title cannot be empty" };
    if (t.length > 300) return { ok: false, message: "title is too long" };
    set.title = t;
  }
  if (raw.kind !== undefined) {
    if (!isKind(raw.kind)) return { ok: false, message: "unknown kind" };
    set.kind = raw.kind;
  }
  if (raw.status !== undefined) {
    if (!isStatus(raw.status)) return { ok: false, message: "unknown status" };
    set.status = raw.status;
  }
  if (raw.priority !== undefined) {
    if (!isPriority(raw.priority)) return { ok: false, message: "priority must be p0, p1, p2 or p3" };
    set.priority = raw.priority as Priority;
  }
  if (raw.estimate !== undefined) {
    const e = raw.estimate === null || raw.estimate === "" ? null : raw.estimate;
    if (e !== null && !isEstimate(e)) {
      return { ok: false, message: "estimate must be XS, S, M, L or XL" };
    }
    set.estimate = e as Estimate | null;
  }
  if (raw.assignee !== undefined) set.assignee = raw.assignee ? String(raw.assignee) : null;

  const epic = raw.epic_id !== undefined ? raw.epic_id : raw.epic;
  if (epic !== undefined) {
    const id = epic ? String(epic) : null;
    if (id) {
      const [found] = await db.select({ id: epics.id }).from(epics).where(eq(epics.id, id)).limit(1);
      if (!found) return { ok: false, message: `no epic with id "${id}"` };
    }
    set.epicId = id;
  }
  const ms = raw.milestone_id !== undefined ? raw.milestone_id : raw.milestone;
  if (ms !== undefined) {
    const id = ms ? String(ms) : null;
    if (id) {
      const [found] = await db
        .select({ id: milestones.id })
        .from(milestones)
        .where(eq(milestones.id, id))
        .limit(1);
      if (!found) return { ok: false, message: `no milestone with id "${id}"` };
    }
    set.milestoneId = id;
  }

  if (raw.labels !== undefined) {
    const list = toList(raw.labels);
    if (!list) return { ok: false, message: "labels must be a list of strings" };
    const labels = list.map((l) => l.toLowerCase());
    if (labels.length > 12) return { ok: false, message: "at most 12 labels" };
    const bad = labels.find((l) => !LABEL_RE.test(l));
    if (bad) {
      return {
        ok: false,
        message: `label "${bad}" is not allowed: lowercase letters, digits and . _ : / -, up to 32 characters`,
      };
    }
    set.labels = [...new Set(labels)];
  }

  if (raw.depends_on !== undefined) {
    const ids = toList(raw.depends_on);
    if (!ids) return { ok: false, message: "depends_on must be a list of ticket ids" };
    if (selfId && ids.includes(selfId)) {
      return { ok: false, message: "a ticket cannot depend on itself" };
    }
    if (ids.length > 20) return { ok: false, message: "at most 20 dependencies" };
    if (ids.length) {
      const found = await db.select({ id: tickets.id }).from(tickets).where(inArray(tickets.id, ids));
      const have = new Set(found.map((r) => r.id));
      const missing = ids.find((i) => !have.has(i));
      if (missing) return { ok: false, message: `depends_on: no ticket with id "${missing}"` };
    }
    set.dependsOn = ids;
  }

  if (raw.blocked_reason !== undefined) set.blockedReason = text(raw.blocked_reason).trim().slice(0, 300);
  if (raw.design_doc !== undefined) set.designDoc = text(raw.design_doc).trim().slice(0, 500);
  if (raw.criteria !== undefined) set.criteria = text(raw.criteria).slice(0, 4000);
  if (raw.decision !== undefined) set.decision = text(raw.decision).slice(0, 2000);
  if (raw.branch !== undefined) set.branch = text(raw.branch).trim().slice(0, 200);
  if (raw.notes !== undefined) set.notes = text(raw.notes).slice(0, 4000);

  if (raw.rank !== undefined) {
    const n = Number(raw.rank);
    if (!Number.isFinite(n)) return { ok: false, message: "rank must be a number" };
    set.rank = n;
  }

  return { ok: true, set };
}

export type CreateResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; code: "conflict" | "invalid"; message: string };

export async function createTicket(
  input: TicketInput,
  actor: string,
  note = "created",
): Promise<CreateResult> {
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false, code: "invalid", message: "title is required" };

  const explicitId = String(input.id ?? "").trim();
  if (explicitId && !/^[A-Za-z0-9._~-]{1,200}$/.test(explicitId)) {
    return { ok: false, code: "invalid", message: "id may only contain letters, digits, . _ ~ -" };
  }
  const id = explicitId || (wantsSlug(input) ? slugId(title) : randomId());

  const built = await buildSet({ ...input, title }, id);
  if (!built.ok) return { ok: false, code: "invalid", message: built.message };

  // Newest-last unless the caller said where it goes: a subquery rather than a
  // read-then-write, so two creates at once cannot be handed the same slot.
  const rank = built.set.rank ?? sql`(select coalesce(max(${tickets.rank}), 0) + 1000 from ${tickets})`;

  const inserted = await db
    .insert(tickets)
    .values({ ...built.set, id, title, rank } as typeof tickets.$inferInsert)
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    return { ok: false, code: "conflict", message: `a ticket with id "${id}" already exists` };
  }
  await appendEvent(id, actor, note);
  return { ok: true, ticket: serializeTicket(inserted[0]) };
}

/**
 * Agents open tickets straight into In progress; the UI's add button does not.
 * That is a good enough tell to pick the readable slug id over a random one.
 */
function wantsSlug(input: TicketInput) {
  return Boolean(input.status && input.status !== "todo" && input.status !== "backlog");
}

export type PatchResult =
  | { ok: true; ticket: Ticket; changed: string[] }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "conflict"; ticket: Ticket }
  | { ok: false; code: "invalid"; message: string };

/**
 * Partial update with optimistic concurrency.
 *
 * `ifMatch` is folded into the UPDATE's own WHERE clause, so the version check
 * and the write are a single statement: two agents racing on the same ticket
 * cannot both succeed.
 */
export async function patchTicket(
  id: string,
  patch: Patch,
  opts: { ifMatch?: number | null; actor: string; note?: string | null },
): Promise<PatchResult> {
  const [before] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!before) return { ok: false, code: "not_found" };

  const built = await buildSet(patch, id);
  if (!built.ok) return { ok: false, code: "invalid", message: built.message };
  const set = built.set;

  const prior = before as unknown as Record<string, unknown>;
  const changed = Object.keys(set).filter((k) => JSON.stringify(set[k]) !== JSON.stringify(prior[k]));

  if (changed.length === 0) {
    // Nothing moved, but an explicit note is still worth recording.
    if (opts.note) await appendEvent(id, opts.actor, opts.note);
    return { ok: true, ticket: serializeTicket(before), changed: [] };
  }

  // Dragging a card up or down a column is not news: it bumps the version so
  // other viewers re-sync, but leaves `updated_at` and the activity feed alone.
  const reorderOnly = changed.length === 1 && changed[0] === "rank" && !opts.note;

  const guard =
    opts.ifMatch != null
      ? and(eq(tickets.id, id), eq(tickets.version, opts.ifMatch))
      : eq(tickets.id, id);

  const updated = await db
    .update(tickets)
    .set({
      ...set,
      ...(reorderOnly ? {} : { updatedAt: new Date() }),
      version: sql`${tickets.version} + 1`,
    })
    .where(guard)
    .returning();

  if (updated.length === 0) {
    const [current] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    if (!current) return { ok: false, code: "not_found" };
    return { ok: false, code: "conflict", ticket: serializeTicket(current) };
  }

  if (!reorderOnly) {
    const shown = changed.filter((k) => k !== "rank").map((k) => FIELD_NAMES[k] ?? k);
    // A claim sets the assignee as part of the move; that is not worth repeating.
    const alsoShown = shown.filter((k) => k !== "status" && k !== "assignee");
    const text =
      opts.note ??
      (changed.includes("status")
        ? `moved to ${statusLabel(String(set.status))}` +
          (alsoShown.length ? `; edited ${alsoShown.join(", ")}` : "")
        : `edited ${shown.join(", ")}`);
    await appendEvent(id, opts.actor, text);
  }

  return {
    ok: true,
    ticket: serializeTicket(updated[0]),
    changed: changed.map((k) => FIELD_NAMES[k] ?? k),
  };
}

export async function deleteTicket(id: string): Promise<boolean> {
  const rows = await db.delete(tickets).where(eq(tickets.id, id)).returning({ id: tickets.id });
  if (rows.length > 0) {
    // Anything that depended on it is no longer waiting for it.
    await db
      .update(tickets)
      .set({ dependsOn: sql`array_remove(${tickets.dependsOn}, ${id})` })
      .where(sql`${id} = any(${tickets.dependsOn})`);
  }
  return rows.length > 0;
}

/**
 * A cheap fingerprint of the whole board, used by the SSE route to notice change
 * without streaming rows. Catches inserts and deletes (the count), edits (the
 * version sum) and bare event appends (the highest event id), across tickets,
 * epics and milestones.
 */
export async function changeToken(): Promise<string> {
  const res = await db.execute<{ token: string }>(sql`
    select
      (select count(*) from tickets)::text
      || ':' || (select coalesce(sum(version), 0) from tickets)::text
      || ':' || (select coalesce(max(id), 0) from ticket_events)::text
      || ':' || (select count(*) from ticket_events)::text
      || ':' || (select coalesce(sum(length(text)), 0) from ticket_events)::text
      || ':' || (select count(*) from epics)::text
      || ':' || (select coalesce(sum(version), 0) from epics)::text
      || ':' || (select count(*) from milestones)::text
      || ':' || (select coalesce(sum(version), 0) from milestones)::text as token
  `);
  return res.rows[0]?.token ?? "0";
}
