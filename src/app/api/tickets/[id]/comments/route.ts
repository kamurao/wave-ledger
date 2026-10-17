import { actorLabel } from "@/lib/authz";
import { apiError, json, readJson, requireWriter, route } from "@/lib/api";
import { addComment, COMMENT_MAX, getComments } from "@/lib/comments";
import { getTicket, resolveTicketId } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function GETHandler(_req: Request, ctx: Ctx) {
  const id = await resolveTicketId((await ctx.params).id);
  if (!(await getTicket(id))) return apiError(404, "no such ticket");
  return json({ comments: await getComments(id) });
}

/** Posts a comment. Anyone who can write may comment; `by` credits it as history does. */
async function POSTHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const id = await resolveTicketId((await ctx.params).id);
  if (!(await getTicket(id))) return apiError(404, "no such ticket");

  const body = await readJson(req);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return apiError(400, "body is required");
  if (text.length > COMMENT_MAX) return apiError(400, `a comment is at most ${COMMENT_MAX} characters`);

  const author = actorLabel(gate.actor, typeof body?.by === "string" ? body.by : null);
  const comment = await addComment(id, author, text);
  return json({ comment, comments: await getComments(id) }, { status: 201 });
}

export const GET = route(GETHandler);
export const POST = route(POSTHandler);
