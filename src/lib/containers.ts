import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  canonicalHandle,
  isEpicColor,
  isEpicStatus,
  isMilestoneStatus,
  META,
} from "./constants";
import { slugWith } from "./ids";
import { listTickets } from "./tickets";
import { epics, milestones, type EpicRow, type MilestoneRow } from "./schema";
import type { Board, Epic, Milestone } from "./types";

/**
 * Epics and milestones: the two ways a ticket is grouped. They share a shape —
 * a slug id, a version for optimistic concurrency, a position for ordering — so
 * they share this file. Neither keeps an event log; the version and
 * `updated_at` are enough for things that change this rarely.
 */

export function serializeEpic(r: EpicRow): Epic {
  return {
    id: r.id,
    name: r.name,
    summary: r.summary,
    color: isEpicColor(r.color) ? r.color : "e1",
    status: isEpicStatus(r.status) ? r.status : "active",
    owner: r.owner,
    position: r.position,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    version: r.version,
  };
}

export function serializeMilestone(r: MilestoneRow): Milestone {
  return {
    id: r.id,
    name: r.name,
    goal: r.goal,
    target_date: r.targetDate,
    status: isMilestoneStatus(r.status) ? r.status : "upcoming",
    position: r.position,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    version: r.version,
  };
}

export async function listEpics(): Promise<Epic[]> {
  const rows = await db.select().from(epics).orderBy(asc(epics.position), asc(epics.createdAt));
  return rows.map(serializeEpic);
}

export async function listMilestones(): Promise<Milestone[]> {
  const rows = await db
    .select()
    .from(milestones)
    .orderBy(asc(milestones.position), asc(milestones.createdAt));
  return rows.map(serializeMilestone);
}

/** Everything the board renders, in one round trip. Agents read this too. */
export async function getBoard(): Promise<Board> {
  const [tickets, epicList, milestoneList] = await Promise.all([
    listTickets(),
    listEpics(),
    listMilestones(),
  ]);
  return { tickets, epics: epicList, milestones: milestoneList };
}

export { META };

type Result<T> =
  | { ok: true; item: T }
  | { ok: false; code: "not_found" | "invalid" | "conflict"; message: string; current?: T };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

// ---------------------------------------------------------------------------
// Epics
// ---------------------------------------------------------------------------

function epicValues(raw: Record<string, unknown>): { set: Record<string, unknown> } | { error: string } {
  const set: Record<string, unknown> = {};
  if (raw.name !== undefined) {
    const n = String(raw.name ?? "").trim();
    if (!n) return { error: "name cannot be empty" };
    if (n.length > 80) return { error: "name is too long" };
    set.name = n;
  }
  if (raw.summary !== undefined) set.summary = String(raw.summary ?? "").slice(0, 1000);
  if (raw.color !== undefined) {
    if (!isEpicColor(raw.color)) return { error: "color must be one of e1 .. e8" };
    set.color = raw.color;
  }
  if (raw.status !== undefined) {
    if (!isEpicStatus(raw.status)) return { error: "status must be active, paused, done or archived" };
    set.status = raw.status;
  }
  if (raw.owner !== undefined) {
    if (raw.owner === null || raw.owner === "") set.owner = null;
    else {
      const h = canonicalHandle(raw.owner);
      if (!h) return { error: `"${String(raw.owner)}" is not a known contributor handle` };
      set.owner = h;
    }
  }
  if (raw.position !== undefined) {
    const n = Number(raw.position);
    if (!Number.isInteger(n)) return { error: "position must be an integer" };
    set.position = n;
  }
  return { set };
}

export async function getEpic(id: string): Promise<Epic | null> {
  const [row] = await db.select().from(epics).where(eq(epics.id, id)).limit(1);
  return row ? serializeEpic(row) : null;
}

export async function createEpic(raw: Record<string, unknown>): Promise<Result<Epic>> {
  const name = String(raw.name ?? "").trim();
  if (!name) return { ok: false, code: "invalid", message: "name is required" };
  const explicit = String(raw.id ?? "").trim();
  if (explicit && !/^[A-Za-z0-9._~-]{1,200}$/.test(explicit)) {
    return { ok: false, code: "invalid", message: "id may only contain letters, digits, . _ ~ -" };
  }
  const built = epicValues({ ...raw, name });
  if ("error" in built) return { ok: false, code: "invalid", message: built.error };

  const id = explicit || slugWith("e", name);
  const position =
    built.set.position ?? sql`(select coalesce(max(${epics.position}), 0) + 1 from ${epics})`;
  const rows = await db
    .insert(epics)
    .values({ ...built.set, id, name, position } as typeof epics.$inferInsert)
    .onConflictDoNothing()
    .returning();
  if (rows.length === 0) {
    return { ok: false, code: "conflict", message: `an epic with id "${id}" already exists` };
  }
  return { ok: true, item: serializeEpic(rows[0]) };
}

export async function patchEpic(
  id: string,
  raw: Record<string, unknown>,
  ifMatch: number | null,
): Promise<Result<Epic>> {
  const built = epicValues(raw);
  if ("error" in built) return { ok: false, code: "invalid", message: built.error };
  const before = await getEpic(id);
  if (!before) return { ok: false, code: "not_found", message: "no such epic" };
  if (Object.keys(built.set).length === 0) return { ok: true, item: before };

  const guard = ifMatch != null ? and(eq(epics.id, id), eq(epics.version, ifMatch)) : eq(epics.id, id);
  const rows = await db
    .update(epics)
    .set({ ...built.set, updatedAt: new Date(), version: sql`${epics.version} + 1` })
    .where(guard)
    .returning();
  if (rows.length === 0) {
    const current = await getEpic(id);
    if (!current) return { ok: false, code: "not_found", message: "no such epic" };
    return { ok: false, code: "conflict", message: "the epic changed since you read it", current };
  }
  return { ok: true, item: serializeEpic(rows[0]) };
}

export async function deleteEpic(id: string): Promise<boolean> {
  const rows = await db.delete(epics).where(eq(epics.id, id)).returning({ id: epics.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

function milestoneValues(
  raw: Record<string, unknown>,
): { set: Record<string, unknown> } | { error: string } {
  const set: Record<string, unknown> = {};
  if (raw.name !== undefined) {
    const n = String(raw.name ?? "").trim();
    if (!n) return { error: "name cannot be empty" };
    if (n.length > 80) return { error: "name is too long" };
    set.name = n;
  }
  if (raw.goal !== undefined) set.goal = String(raw.goal ?? "").slice(0, 1000);
  if (raw.target_date !== undefined) {
    const v = raw.target_date === null ? "" : String(raw.target_date).trim();
    if (v && !validDate(v)) return { error: "target_date must be YYYY-MM-DD, or null to clear it" };
    set.targetDate = v || null;
  }
  if (raw.status !== undefined) {
    if (!isMilestoneStatus(raw.status)) return { error: "status must be upcoming, active or done" };
    set.status = raw.status;
  }
  if (raw.position !== undefined) {
    const n = Number(raw.position);
    if (!Number.isInteger(n)) return { error: "position must be an integer" };
    set.position = n;
  }
  return { set };
}

export async function getMilestone(id: string): Promise<Milestone | null> {
  const [row] = await db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
  return row ? serializeMilestone(row) : null;
}

export async function createMilestone(raw: Record<string, unknown>): Promise<Result<Milestone>> {
  const name = String(raw.name ?? "").trim();
  if (!name) return { ok: false, code: "invalid", message: "name is required" };
  const explicit = String(raw.id ?? "").trim();
  if (explicit && !/^[A-Za-z0-9._~-]{1,200}$/.test(explicit)) {
    return { ok: false, code: "invalid", message: "id may only contain letters, digits, . _ ~ -" };
  }
  const built = milestoneValues({ ...raw, name });
  if ("error" in built) return { ok: false, code: "invalid", message: built.error };

  const id = explicit || slugWith("m", name);
  const position =
    built.set.position ?? sql`(select coalesce(max(${milestones.position}), 0) + 1 from ${milestones})`;
  const rows = await db
    .insert(milestones)
    .values({ ...built.set, id, name, position } as typeof milestones.$inferInsert)
    .onConflictDoNothing()
    .returning();
  if (rows.length === 0) {
    return { ok: false, code: "conflict", message: `a milestone with id "${id}" already exists` };
  }
  return { ok: true, item: serializeMilestone(rows[0]) };
}

export async function patchMilestone(
  id: string,
  raw: Record<string, unknown>,
  ifMatch: number | null,
): Promise<Result<Milestone>> {
  const built = milestoneValues(raw);
  if ("error" in built) return { ok: false, code: "invalid", message: built.error };
  const before = await getMilestone(id);
  if (!before) return { ok: false, code: "not_found", message: "no such milestone" };
  if (Object.keys(built.set).length === 0) return { ok: true, item: before };

  const guard =
    ifMatch != null ? and(eq(milestones.id, id), eq(milestones.version, ifMatch)) : eq(milestones.id, id);
  const rows = await db
    .update(milestones)
    .set({ ...built.set, updatedAt: new Date(), version: sql`${milestones.version} + 1` })
    .where(guard)
    .returning();
  if (rows.length === 0) {
    const current = await getMilestone(id);
    if (!current) return { ok: false, code: "not_found", message: "no such milestone" };
    return { ok: false, code: "conflict", message: "the milestone changed since you read it", current };
  }
  return { ok: true, item: serializeMilestone(rows[0]) };
}

export async function deleteMilestone(id: string): Promise<boolean> {
  const rows = await db.delete(milestones).where(eq(milestones.id, id)).returning({ id: milestones.id });
  return rows.length > 0;
}
