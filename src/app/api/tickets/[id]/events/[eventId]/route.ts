import { canDelete } from "@/lib/authz";
import { apiError, json, readJson, requireWriter, route } from "@/lib/api";
import { deleteEvent, getEvents, getTicket, resolveTicketId, updateEventText } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; eventId: string }> };

function parseEventId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Correcting or removing a history line.
 *
 * The log is what lets people trust who moved what, so both verbs are held to
 * the same bar as deleting a ticket: agents and signed-in writers only. An
 * open-board visitor can append to history but cannot rewrite it.
 */
async function PATCHHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;
  if (!canDelete(gate.actor)) {
    return apiError(403, "editing history is off on an open board — only agents and signed-in writers can");
  }

  const { id: ref, eventId: raw } = await ctx.params;
  const id = await resolveTicketId(ref);
  const eventId = parseEventId(raw);
  if (!eventId) return apiError(400, "event id must be a positive integer");

  const body = await readJson(req);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return apiError(400, "text is required");

  const updated = await updateEventText(id, eventId, text);
  if (!updated) return apiError(404, "no such history entry on that ticket");
  return json({ event: updated, events: await getEvents(id) });
}

async function DELETEHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;
  if (!canDelete(gate.actor)) {
    return apiError(403, "deleting history is off on an open board — only agents and signed-in writers can");
  }

  const { id: ref, eventId: raw } = await ctx.params;
  const id = await resolveTicketId(ref);
  const eventId = parseEventId(raw);
  if (!eventId) return apiError(400, "event id must be a positive integer");
  if (!(await getTicket(id))) return apiError(404, "no such ticket");

  if (!(await deleteEvent(id, eventId))) return apiError(404, "no such history entry on that ticket");
  return json({ deleted: eventId, events: await getEvents(id) });
}

export const PATCH = route(PATCHHandler);
export const DELETE = route(DELETEHandler);
