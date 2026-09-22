import { actorLabel } from "@/lib/authz";
import { apiError, json, readJson, requireWriter, route } from "@/lib/api";
import { appendEvent, getEvents, getTicket } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function GETHandler(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!(await getTicket(id))) return apiError(404, "no such ticket");
  return json({ events: await getEvents(id) });
}

/**
 * Appends one history line. Mutations log themselves, so this is only for the
 * cases with nothing to change — "blocked on art", "picked up again".
 */
async function POSTHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const { id } = await ctx.params;
  if (!(await getTicket(id))) return apiError(404, "no such ticket");

  const body = await readJson(req);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return apiError(400, "text is required");

  await appendEvent(id, actorLabel(gate.actor, typeof body?.by === "string" ? body.by : null), text);
  return json({ events: await getEvents(id) }, { status: 201 });
}

export const GET = route(GETHandler);
export const POST = route(POSTHandler);
