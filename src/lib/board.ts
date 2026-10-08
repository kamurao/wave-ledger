import type { Status } from "./constants";
import type { Epic, Ticket } from "./types";

/**
 * Pure helpers over a loaded board. No database, no React, so the client and
 * the server can share them.
 */

export type ChecklistItem = { text: string; checked: boolean; line: number };

const ITEM = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;

/** Reads `- [ ] item` / `- [x] item` lines out of a ticket's criteria. */
export function checklist(criteria: string): { items: ChecklistItem[]; done: number; total: number } {
  const items: ChecklistItem[] = [];
  criteria.split("\n").forEach((raw, line) => {
    const m = ITEM.exec(raw);
    if (m) items.push({ text: m[2].trim(), checked: m[1] !== " ", line });
  });
  return { items, done: items.filter((i) => i.checked).length, total: items.length };
}

/** Flips one checklist line, leaving every other line byte-for-byte alone. */
export function toggleLine(criteria: string, line: number): string {
  const lines = criteria.split("\n");
  const m = ITEM.exec(lines[line] ?? "");
  if (!m) return criteria;
  lines[line] = lines[line].replace(/\[( |x|X)\]/, m[1] === " " ? "[x]" : "[ ]");
  return lines.join("\n");
}

/** Dependencies that are not finished yet. */
export function openDeps(t: Ticket, byId: Map<string, Ticket>): Ticket[] {
  return t.depends_on.map((id) => byId.get(id)).filter((d): d is Ticket => !!d && d.status !== "done");
}

/** Blocked by hand (a reason is set) or by an unfinished dependency. Done work is never blocked. */
export function isBlocked(t: Ticket, byId: Map<string, Ticket>): boolean {
  if (t.status === "done") return false;
  return t.blocked_reason.trim() !== "" || openDeps(t, byId).length > 0;
}

/** A rank that sorts strictly between two neighbours, or past either end. */
export function rankBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return 1000;
  if (prev === undefined) return (next as number) - 1000;
  if (next === undefined) return prev + 1000;
  if (next <= prev) return prev + 1;
  return (prev + next) / 2;
}

export function byRank(a: Ticket, b: Ticket): number {
  return a.rank - b.rank || b.updated_at.localeCompare(a.updated_at);
}

export type Progress = {
  total: number;
  backlog: number;
  todo: number;
  in_progress: number;
  review: number;
  done: number;
  /** 0 to 100, share of tickets finished. */
  pct: number;
  openQuestions: number;
  /** Blocked by hand or waiting on an open dependency. */
  blocked: number;
  /** The subset with an explicit blocked_reason, which is the one that needs a human. */
  hardBlocked: number;
};

export function progressOf(list: Ticket[], byId: Map<string, Ticket>): Progress {
  const p: Progress = {
    total: list.length,
    backlog: 0,
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    pct: 0,
    openQuestions: 0,
    blocked: 0,
    hardBlocked: 0,
  };
  for (const t of list) {
    p[t.status as Status] += 1;
    if (t.kind === "question" && t.status !== "done") p.openQuestions += 1;
    if (isBlocked(t, byId)) p.blocked += 1;
    if (t.status !== "done" && t.blocked_reason.trim() !== "") p.hardBlocked += 1;
  }
  p.pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return p;
}

export function epicName(epics: Epic[], id: string | null): string {
  return epics.find((e) => e.id === id)?.name ?? "No epic";
}

export function formatDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Days from today until a YYYY-MM-DD date; negative once it has passed. */
export function daysUntil(d: string | null, now: number): number | null {
  if (!d) return null;
  const t = new Date(`${d}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}
