import { actorLabel, canDelete } from "@/lib/authz";
import { apiError, json, parseIfMatch, pickPatch, readJson, requireWriter, route } from "@/lib/api";
import { getComments } from "@/lib/comments";
import {
  deleteTicket,
  getEvents,
  getTicket,
  patchTicket,
  resolveTicketId,
  setTicketDeleted,
} from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function GETHandler(_req: Request, ctx: Ctx) {
  const id = await resolveTicketId((await ctx.params).id);
  const ticket = await getTicket(id);
  if (!ticket) return apiError(404, "no such ticket");
  const [events, comments] = await Promise.all([getEvents(id), getComments(id)]);
  return json({ ticket, events, comments });
}

async function PATCHHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const id = await resolveTicketId((await ctx.params).id);
  const body = await readJson(req);
  if (!body) return apiError(400, "expected a JSON object body");

  const result = await patchTicket(id, pickPatch(body), {
    ifMatch: parseIfMatch(req, body),
    actor: actorLabel(gate.actor, typeof body.by === "string" ? body.by : null),
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
  });

  if (result.ok) return json({ ticket: result.ticket, changed: result.changed });
  if (result.code === "not_found") return apiError(404, "no such ticket");
  if (result.code === "invalid") return apiError(400, result.message);
  if (result.code === "deleted") {
    return apiError(410, "the ticket is deleted — POST /api/tickets/:id/restore first", { ticket: result.ticket });
  }

  // 409: hand back the row as it stands so the caller can rebase and retry.
  return apiError(409, "the ticket changed since you read it", {
    ticket: result.ticket,
    events: await getEvents(id),
  });
}

/**
 * Deleting moves the ticket to the Deleted list, where anyone can restore it, so
 * it is open to every writer, open-board visitors included. `?purge=1` removes
 * the row for good and is held to the stricter bar: agents and signed-in writers.
 */
async function DELETEHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const id = await resolveTicketId((await ctx.params).id);
  const sp = new URL(req.url).searchParams;
  const purge = ["1", "true", "yes"].includes((sp.get("purge") ?? "").toLowerCase());

  if (purge) {
    if (!canDelete(gate.actor)) {
      return apiError(403, "purging is off on an open board — a plain DELETE moves it to the Deleted list");
    }
    if (!(await deleteTicket(id))) return apiError(404, "no such ticket");
    return json({ deleted: id, purged: true });
  }

  const body = await readJson(req);
  const by = typeof body?.by === "string" ? body.by : sp.get("by");
  const result = await setTicketDeleted(id, true, actorLabel(gate.actor, by));
  if (!result.ok && result.code === "not_found") return apiError(404, "no such ticket");
  // Deleting twice is not an error worth retrying: it is gone either way.
  return json({ deleted: id, ticket: result.ticket, already: !result.ok });
}

export const GET = route(GETHandler);
export const PATCH = route(PATCHHandler);
export const DELETE = route(DELETEHandler);
