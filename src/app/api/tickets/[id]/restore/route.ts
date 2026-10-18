import { actorLabel } from "@/lib/authz";
import { apiError, json, readJson, requireWriter, route } from "@/lib/api";
import { resolveTicketId, setTicketDeleted } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Brings a deleted ticket back to the board where it was: same column, rank and links. */
async function POSTHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const id = await resolveTicketId((await ctx.params).id);
  const body = await readJson(req);
  const result = await setTicketDeleted(
    id,
    false,
    actorLabel(gate.actor, typeof body?.by === "string" ? body.by : null),
  );
  if (!result.ok && result.code === "not_found") return apiError(404, "no such ticket");
  return json({ ticket: result.ticket, already: !result.ok });
}

export const POST = route(POSTHandler);
