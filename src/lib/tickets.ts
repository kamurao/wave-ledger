import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { isKind, isSection, isStatus, statusLabel } from "./constants";
import { randomId, slugId } from "./ids";
import { ticketEvents, tickets, type TicketEventRow, type TicketRow } from "./schema";
import type { ActivityRow, Ticket, TicketEvent } from "./types";

export function serializeTicket(r: TicketRow): Ticket {
  return {
    id: r.id,
    title: r.title,
    kind: isKind(r.kind) ? r.kind : "feature",
    status: isStatus(r.status) ? r.status : "todo",
    assignee: r.assignee,
    section: isSection(r.section) ? r.section : "Unsorted",
    branch: r.branch,
    notes: r.notes,
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

export type TicketFilters = { status?: string; assignee?: string; q?: string };

export async function listTickets(f: TicketFilters = {}): Promise<Ticket[]> {
  const where = [];
  if (f.status && isStatus(f.status)) where.push(eq(tickets.status, f.status));
  if (f.assignee === "__none") where.push(sql`${tickets.assignee} is null`);
  else if (f.assignee) where.push(eq(tickets.assignee, f.assignee));
  if (f.q) {
    const pat = `%${f.q}%`;
    where.push(
      or(ilike(tickets.title, pat), ilike(tickets.notes, pat), ilike(tickets.branch, pat))!,
    );
  }
  const rows = await db
    .select()
    .from(tickets)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(tickets.updatedAt));
  return rows.map(serializeTicket);
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

export type TicketInput = {
  id?: string | null;
  title: string;
  kind?: string;
  status?: string;
  assignee?: string | null;
  section?: string;
  branch?: string;
  notes?: string;
};

export type CreateResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; code: "conflict" | "invalid"; message: string };

export async function createTicket(
  input: TicketInput,
  actor: string,
  note = "created",
): Promise<CreateResult> {
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, code: "invalid", message: "title is required" };
  if (title.length > 300) return { ok: false, code: "invalid", message: "title is too long" };

  const explicitId = (input.id ?? "").trim();
  if (explicitId && !/^[A-Za-z0-9._~-]{1,200}$/.test(explicitId)) {
    return { ok: false, code: "invalid", message: "id may only contain letters, digits, . _ ~ -" };
  }
  const id = explicitId || (wantsSlug(input) ? slugId(title) : randomId());

  const values = {
    id,
    title,
    kind: isKind(input.kind) ? input.kind : "feature",
    status: isStatus(input.status) ? input.status : "todo",
    assignee: input.assignee ? String(input.assignee) : null,
    section: isSection(input.section) ? input.section : "Unsorted",
    branch: (input.branch ?? "").trim(),
    notes: (input.notes ?? "").slice(0, 4000),
  };

  const inserted = await db.insert(tickets).values(values).onConflictDoNothing().returning();
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
  return Boolean(input.status && input.status !== "todo");
}

export type Patch = Partial<{
  title: string;
  kind: string;
  status: string;
  assignee: string | null;
  section: string;
  branch: string;
  notes: string;
}>;

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

  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, code: "invalid", message: "title cannot be empty" };
    if (t.length > 300) return { ok: false, code: "invalid", message: "title is too long" };
    set.title = t;
  }
  if (patch.kind !== undefined) {
    if (!isKind(patch.kind)) return { ok: false, code: "invalid", message: "unknown kind" };
    set.kind = patch.kind;
  }
  if (patch.status !== undefined) {
    if (!isStatus(patch.status)) return { ok: false, code: "invalid", message: "unknown status" };
    set.status = patch.status;
  }
  if (patch.section !== undefined) {
    if (!isSection(patch.section)) return { ok: false, code: "invalid", message: "unknown section" };
    set.section = patch.section;
  }
  if (patch.assignee !== undefined) set.assignee = patch.assignee || null;
  if (patch.branch !== undefined) set.branch = (patch.branch ?? "").trim();
  if (patch.notes !== undefined) set.notes = (patch.notes ?? "").slice(0, 4000);

  const prior = before as unknown as Record<string, unknown>;
  const changed = Object.keys(set).filter(
    (k) => String(set[k] ?? "") !== String(prior[k] ?? ""),
  );

  if (changed.length === 0) {
    // Nothing moved, but an explicit note is still worth recording.
    if (opts.note) await appendEvent(id, opts.actor, opts.note);
    return { ok: true, ticket: serializeTicket(before), changed: [] };
  }

  const guard =
    opts.ifMatch != null
      ? and(eq(tickets.id, id), eq(tickets.version, opts.ifMatch))
      : eq(tickets.id, id);

  const updated = await db
    .update(tickets)
    .set({ ...set, updatedAt: new Date(), version: sql`${tickets.version} + 1` })
    .where(guard)
    .returning();

  if (updated.length === 0) {
    const [current] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    if (!current) return { ok: false, code: "not_found" };
    return { ok: false, code: "conflict", ticket: serializeTicket(current) };
  }

  const text =
    opts.note ?? (changed.includes("status") ? `moved to ${statusLabel(String(set.status))}` : "edited");
  await appendEvent(id, opts.actor, text);

  return { ok: true, ticket: serializeTicket(updated[0]), changed };
}

export async function deleteTicket(id: string): Promise<boolean> {
  const rows = await db.delete(tickets).where(eq(tickets.id, id)).returning({ id: tickets.id });
  return rows.length > 0;
}

/**
 * A cheap fingerprint of the whole board, used by the SSE route to notice change
 * without streaming rows. Catches inserts and deletes (the count), edits (the
 * version sum) and bare event appends (the highest event id).
 */
export async function changeToken(): Promise<string> {
  const res = await db.execute<{ token: string }>(sql`
    select
      (select count(*) from tickets)::text
      || ':' || (select coalesce(sum(version), 0) from tickets)::text
      || ':' || (select coalesce(max(id), 0) from ticket_events)::text as token
  `);
  return res.rows[0]?.token ?? "0:0:0";
}
