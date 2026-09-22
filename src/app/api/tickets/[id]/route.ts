import { actorLabel, canDelete } from "@/lib/authz";
import { apiError, json, parseIfMatch, pickPatch, readJson, requireWriter, route } from "@/lib/api";
import { deleteTicket, getEvents, getTicket, patchTicket, type Patch } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function GETHandler(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ticket = await getTicket(id);
  if (!ticket) return apiError(404, "no such ticket");
  const events = await getEvents(id);
  return json({ ticket, events });
}

async function PATCHHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return apiError(400, "expected a JSON object body");

  const result = await patchTicket(id, pickPatch(body) as Patch, {
    ifMatch: parseIfMatch(req, body),
    actor: actorLabel(gate.actor, typeof body.by === "string" ? body.by : null),
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
  });

  if (result.ok) return json({ ticket: result.ticket, changed: result.changed });
  if (result.code === "not_found") return apiError(404, "no such ticket");
  if (result.code === "invalid") return apiError(400, result.message);

  // 409: hand back the row as it stands so the caller can rebase and retry.
  return apiError(409, "the ticket changed since you read it", {
    ticket: result.ticket,
    events: await getEvents(id),
  });
}

async function DELETEHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;
  if (!canDelete(gate.actor)) {
    return apiError(403, "deleting is off on an open board — move it to Complete instead");
  }

  const { id } = await ctx.params;
  const ok = await deleteTicket(id);
  if (!ok) return apiError(404, "no such ticket");
  return json({ deleted: id });
}

export const GET = route(GETHandler);
export const PATCH = route(PATCHHandler);
export const DELETE = route(DELETEHandler);
