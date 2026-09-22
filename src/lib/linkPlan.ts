import "server-only";

import { canonicalHandle } from "./constants";
import {
  canonicalQuery,
  currentValue,
  hasLinkParams,
  LINK_FIELDS,
  one,
  parseFields,
  type FieldChange,
  type LinkField,
  type LinkPlan,
  type ParamBag,
} from "./link";
import { getTicket, listTickets } from "./tickets";
import type { Ticket } from "./types";

/**
 * Resolves a link against the board, without applying anything.
 *
 * Opening a link only ever *shows* what would change: link previews, prefetches
 * and back-button navigations all land here and stop. Writing is a separate,
 * explicit call to /api/apply.
 */
export async function planFromParams(bag: ParamBag): Promise<LinkPlan> {
  if (!hasLinkParams(bag)) return { kind: "none" };

  const query = canonicalQuery(bag);
  const byRaw = one(bag, "by");
  const by = canonicalHandle(byRaw);
  if (byRaw !== undefined && byRaw.trim() !== "" && !by) {
    return { kind: "error", message: `"${byRaw}" is not a known contributor handle` };
  }

  const { values, error } = parseFields(bag);
  if (error) return { kind: "error", message: error };

  const add = one(bag, "add");
  const idParam = one(bag, "id");
  const tParam = one(bag, "t");

  if ([add, idParam, tParam].filter((v) => v !== undefined).length > 1) {
    return { kind: "error", message: "use only one of add, id or t in a link" };
  }

  // --- create ---------------------------------------------------------------
  if (add !== undefined) {
    const title = (values.title ?? add).trim();
    if (!title) return { kind: "error", message: "add needs a ticket title" };

    const defaults: Record<LinkField, string> = {
      title,
      // Same rule as Paste a list: a line ending in a question mark is a question.
      kind: /\?\s*$/.test(title) ? "question" : "feature",
      status: "todo",
      assignee: "",
      section: "Unsorted",
      branch: "",
      notes: "",
    };

    const fields: FieldChange[] = [];
    for (const field of LINK_FIELDS) {
      if (field === "title") continue;
      const given = values[field];
      const to = given ?? defaults[field];
      // Always show kind and status — they are inferred, so they are the two
      // worth confirming even when the link did not mention them.
      if (given === undefined && field !== "kind" && field !== "status" && to === defaults[field]) {
        continue;
      }
      fields.push({ field, from: "", to });
    }
    return { kind: "create", title, fields, by, query };
  }

  // --- target an existing ticket -------------------------------------------
  let ticket: Ticket;

  if (idParam !== undefined) {
    const id = idParam.trim();
    if (!id) return { kind: "error", message: "id cannot be empty" };
    const found = await getTicket(id);
    if (!found) return { kind: "error", message: `no ticket with id "${id}"` };
    ticket = found;
  } else {
    const needle = (tParam ?? "").trim().toLowerCase();
    if (!needle) return { kind: "error", message: "t cannot be empty" };
    const all = await listTickets();
    // Match the slug shape too, so `?t=fast-forward` finds "Fast-Forward".
    const matches = all.filter((x) => {
      const title = x.title.toLowerCase();
      return (
        title.includes(needle) ||
        x.id.toLowerCase().includes(needle) ||
        title.replace(/[^a-z0-9]+/g, "-").includes(needle)
      );
    });

    if (matches.length === 0) {
      return { kind: "error", message: `no ticket matches "${tParam}"` };
    }
    if (matches.length > 1) {
      const exact = matches.filter((x) => x.title.toLowerCase() === needle);
      if (exact.length !== 1) {
        return {
          kind: "error",
          message: `"${tParam}" matches ${matches.length} tickets — use id= to pick one`,
          candidates: matches,
        };
      }
      ticket = exact[0];
    } else {
      ticket = matches[0];
    }
  }

  const changes: FieldChange[] = [];
  for (const field of LINK_FIELDS) {
    const to = values[field];
    if (to === undefined) continue;
    const from = currentValue(ticket, field);
    if (from === to) continue;
    changes.push({ field, from, to });
  }

  if (changes.length === 0) {
    return {
      kind: "error",
      message: `this link would not change "${ticket.title}" — every field already matches`,
    };
  }

  return { kind: "update", ticket, changes, by, query };
}
