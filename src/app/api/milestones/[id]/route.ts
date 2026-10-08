import { canDelete } from "@/lib/authz";
import { apiError, json, parseIfMatch, readJson, requireWriter, route } from "@/lib/api";
import { deleteMilestone, getMilestone, patchMilestone } from "@/lib/containers";
import { listTickets } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function GETHandler(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const milestone = await getMilestone(id);
  if (!milestone) return apiError(404, "no such milestone");
  return json({ milestone, tickets: await listTickets({ milestone: id }) });
}

async function PATCHHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return apiError(400, "expected a JSON object body");

  const result = await patchMilestone(id, body, parseIfMatch(req, body));
  if (result.ok) return json({ milestone: result.item });
  if (result.code === "not_found") return apiError(404, result.message);
  if (result.code === "invalid") return apiError(400, result.message);
  return apiError(409, result.message, { milestone: result.current });
}

async function DELETEHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;
  if (!canDelete(gate.actor)) {
    return apiError(403, 'deleting is off on an open board — PATCH status to "done" instead');
  }
  const { id } = await ctx.params;
  if (!(await deleteMilestone(id))) return apiError(404, "no such milestone");
  return json({ deleted: id });
}

export const GET = route(GETHandler);
export const PATCH = route(PATCHHandler);
export const DELETE = route(DELETEHandler);
