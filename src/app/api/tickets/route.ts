import { actorLabel } from "@/lib/authz";
import { apiError, json, pickPatch, readJson, requireWriter, route } from "@/lib/api";
import { createTicket, listTickets } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function GETHandler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const tickets = await listTickets({
    status: sp.get("status") ?? undefined,
    assignee: sp.get("assignee") ?? undefined,
    q: sp.get("q") ?? undefined,
  });
  return json({ tickets });
}

async function POSTHandler(req: Request) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const body = await readJson(req);
  if (!body) return apiError(400, "expected a JSON object body");

  const fields = pickPatch(body);
  const result = await createTicket(
    {
      id: body.id === undefined || body.id === null ? null : String(body.id),
      title: String(body.title ?? ""),
      ...fields,
    } as Parameters<typeof createTicket>[0],
    actorLabel(gate.actor, typeof body.by === "string" ? body.by : null),
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : "created",
  );

  if (!result.ok) {
    return apiError(result.code === "conflict" ? 409 : 400, result.message);
  }
  return json({ ticket: result.ticket }, { status: 201 });
}

export const GET = route(GETHandler);
export const POST = route(POSTHandler);
