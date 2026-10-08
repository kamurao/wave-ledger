import { canDelete } from "@/lib/authz";
import { apiError, json, parseIfMatch, readJson, requireWriter, route } from "@/lib/api";
import { deleteEpic, getEpic, patchEpic } from "@/lib/containers";
import { listTickets } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function GETHandler(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const epic = await getEpic(id);
  if (!epic) return apiError(404, "no such epic");
  return json({ epic, tickets: await listTickets({ epic: id }) });
}

async function PATCHHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return apiError(400, "expected a JSON object body");

  const result = await patchEpic(id, body, parseIfMatch(req, body));
  if (result.ok) return json({ epic: result.item });
  if (result.code === "not_found") return apiError(404, result.message);
  if (result.code === "invalid") return apiError(400, result.message);
  return apiError(409, result.message, { epic: result.current });
}

async function DELETEHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;
  if (!canDelete(gate.actor)) {
    return apiError(403, 'deleting is off on an open board — PATCH status to "archived" instead');
  }
  const { id } = await ctx.params;
  if (!(await deleteEpic(id))) return apiError(404, "no such epic");
  return json({ deleted: id });
}

export const GET = route(GETHandler);
export const PATCH = route(PATCHHandler);
export const DELETE = route(DELETEHandler);
