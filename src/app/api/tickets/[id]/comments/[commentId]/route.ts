import { actorLabel, canDelete, type Actor } from "@/lib/authz";
import { apiError, json, readJson, requireWriter, route } from "@/lib/api";
import { COMMENT_MAX, deleteComment, getComment, getComments, updateComment } from "@/lib/comments";
import { getTicket, resolveTicketId } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

function parseCommentId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * A comment belongs to whoever wrote it: its author may change or remove it,
 * and so may anyone trusted to delete (agents and signed-in writers). On an
 * open board `by` is self-declared, so "author" is a courtesy there, not a lock.
 */
function mayChange(actor: Actor, by: unknown, author: string): boolean {
  if (canDelete(actor)) return true;
  return actorLabel(actor, typeof by === "string" ? by : null) === author;
}

async function load(ctx: Ctx) {
  const { id: ref, commentId: raw } = await ctx.params;
  const id = await resolveTicketId(ref);
  const commentId = parseCommentId(raw);
  if (!commentId) return { ok: false, error: apiError(400, "comment id must be a positive integer") } as const;
  if (!(await getTicket(id))) return { ok: false, error: apiError(404, "no such ticket") } as const;
  const comment = await getComment(id, commentId);
  if (!comment) return { ok: false, error: apiError(404, "no such comment on that ticket") } as const;
  return { ok: true, id, commentId, comment } as const;
}

async function PATCHHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const found = await load(ctx);
  if (!found.ok) return found.error;

  const body = await readJson(req);
  if (!mayChange(gate.actor, body?.by, found.comment.author)) {
    return apiError(403, "only the comment's author can edit it");
  }
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return apiError(400, "body is required");
  if (text.length > COMMENT_MAX) return apiError(400, `a comment is at most ${COMMENT_MAX} characters`);

  const comment = await updateComment(found.id, found.commentId, text);
  if (!comment) return apiError(404, "no such comment on that ticket");
  return json({ comment, comments: await getComments(found.id) });
}

async function DELETEHandler(req: Request, ctx: Ctx) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const found = await load(ctx);
  if (!found.ok) return found.error;

  const body = await readJson(req);
  const by = body?.by ?? new URL(req.url).searchParams.get("by");
  if (!mayChange(gate.actor, by, found.comment.author)) {
    return apiError(403, "only the comment's author can delete it");
  }

  if (!(await deleteComment(found.id, found.commentId))) {
    return apiError(404, "no such comment on that ticket");
  }
  return json({ deleted: found.commentId, comments: await getComments(found.id) });
}

export const PATCH = route(PATCHHandler);
export const DELETE = route(DELETEHandler);
