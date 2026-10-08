import {
  canonicalHandle,
  isEstimate,
  isKind,
  isPriority,
  isStatus,
  KINDS,
  STATUSES,
} from "./constants";
import type { Ticket } from "./types";

/**
 * Update-by-link (spec section 6.6), the half that touches no database.
 *
 * A change expressed as a query string, so it can travel through chat. Anyone
 * can compose one; only a writer can apply one. Resolving a link against the
 * board lives in `linkPlan.ts`, which is server-only — keeping the two apart is
 * what lets the ticket dialog compose links in the browser.
 */

export const LINK_FIELDS = [
  "title",
  "status",
  "kind",
  "assignee",
  "epic",
  "milestone",
  "priority",
  "estimate",
  "branch",
  "notes",
] as const;

export type LinkField = (typeof LINK_FIELDS)[number];

/** Params that make a link an update link rather than a plain visit. */
export const TARGET_PARAMS = ["add", "id", "t"] as const;

/** The ticket property a link field reads from and writes to. */
export const LINK_TO_TICKET = {
  title: "title",
  status: "status",
  kind: "kind",
  assignee: "assignee",
  epic: "epic_id",
  milestone: "milestone_id",
  priority: "priority",
  estimate: "estimate",
  branch: "branch",
  notes: "notes",
} as const satisfies Record<(typeof LINK_FIELDS)[number], keyof Ticket>;

export type FieldChange = { field: LinkField; from: string; to: string };

export type LinkPlan =
  | { kind: "none" }
  | { kind: "error"; message: string; candidates?: Ticket[] }
  | { kind: "create"; title: string; fields: FieldChange[]; by: string | null; query: string }
  | { kind: "update"; ticket: Ticket; changes: FieldChange[]; by: string | null; query: string };

export type ParamBag = Record<string, string | string[] | undefined>;

export function one(bag: ParamBag, key: string): string | undefined {
  const v = bag[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function hasLinkParams(bag: ParamBag): boolean {
  return TARGET_PARAMS.some((k) => one(bag, k) !== undefined);
}

export function displayValue(field: LinkField, value: string): string {
  if (value === "") return "—";
  if (field === "status") return STATUSES.find((s) => s.id === value)?.label ?? value;
  if (field === "assignee") return "@" + value;
  if (field === "priority") return value.toUpperCase();
  return value;
}

export type ParsedFields = { values: Partial<Record<LinkField, string>>; error?: string };

/**
 * Reads the settable fields. A param that is present but empty clears the field,
 * which is why this distinguishes `undefined` from `""` throughout.
 */
export function parseFields(bag: ParamBag): ParsedFields {
  const values: Partial<Record<LinkField, string>> = {};
  for (const field of LINK_FIELDS) {
    const raw = one(bag, field);
    if (raw === undefined) continue;
    const v = raw.trim();

    if (field === "status") {
      if (v === "") return { values, error: "status cannot be cleared" };
      if (!isStatus(v)) {
        return {
          values,
          error: `status must be one of ${STATUSES.map((s) => s.id).join(", ")} — got "${v}"`,
        };
      }
    }
    if (field === "kind") {
      if (v === "") return { values, error: "kind cannot be cleared" };
      if (!isKind(v)) {
        return {
          values,
          error: `kind must be one of ${KINDS.map((k) => k.id).join(", ")} — got "${v}"`,
        };
      }
    }
    if (field === "priority") {
      if (v === "") return { values, error: "priority cannot be cleared" };
      if (!isPriority(v)) return { values, error: `priority must be p0, p1, p2 or p3 — got "${v}"` };
    }
    if (field === "estimate" && v !== "" && !isEstimate(v)) {
      return { values, error: `estimate must be XS, S, M, L or XL — got "${v}"` };
    }
    if (field === "title" && v === "") {
      return { values, error: "title cannot be cleared" };
    }
    if (field === "assignee" && v !== "") {
      const handle = canonicalHandle(v);
      if (!handle) return { values, error: `"${v}" is not a known contributor handle` };
      values[field] = handle;
      continue;
    }
    values[field] = v;
  }
  return { values };
}

export function currentValue(ticket: Ticket, field: LinkField): string {
  const v = ticket[LINK_TO_TICKET[field]];
  return v == null ? "" : String(v);
}

/** Rebuilds a canonical query string, so Apply re-resolves exactly what was shown. */
export function canonicalQuery(bag: ParamBag): string {
  const sp = new URLSearchParams();
  for (const key of [...TARGET_PARAMS, ...LINK_FIELDS, "by"]) {
    const v = one(bag, key);
    if (v !== undefined) sp.set(key, v);
  }
  return sp.toString();
}

/** Composes a link from a ticket and the fields a form actually altered. */
export function composeLink(
  origin: string,
  ticketId: string,
  changes: Partial<Record<LinkField, string>>,
  by?: string | null,
): string {
  const sp = new URLSearchParams();
  sp.set("id", ticketId);
  for (const field of LINK_FIELDS) {
    const v = changes[field];
    if (v === undefined) continue;
    sp.set(field, v);
  }
  if (by) sp.set("by", by);
  return `${origin}/?${sp.toString()}`;
}
