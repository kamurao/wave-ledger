import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { ticketComments, type TicketCommentRow } from "./schema";
import { appendEvent } from "./tickets";
import type { TicketComment } from "./types";

export const COMMENT_MAX = 4000;

export function serializeComment(r: TicketCommentRow): TicketComment {
  return {
    id: Number(r.id),
    ticket_id: r.ticketId,
    at: r.at.toISOString(),
    author: r.author,
    body: r.body,
    edited_at: r.editedAt ? r.editedAt.toISOString() : null,
  };
}

/** Oldest first: a conversation reads top to bottom, unlike the history log. */
export async function getComments(ticketId: string): Promise<TicketComment[]> {
  const rows = await db
    .select()
    .from(ticketComments)
    .where(eq(ticketComments.ticketId, ticketId))
    .orderBy(asc(ticketComments.at), asc(ticketComments.id));
  return rows.map(serializeComment);
}

export async function getComment(ticketId: string, commentId: number): Promise<TicketComment | null> {
  const [row] = await db
    .select()
    .from(ticketComments)
    .where(and(eq(ticketComments.id, commentId), eq(ticketComments.ticketId, ticketId)))
    .limit(1);
  return row ? serializeComment(row) : null;
}

/** One line in the Activity feed, so a comment is noticed without opening the ticket. */
function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? flat.slice(0, 79) + "…" : flat;
}

export async function addComment(ticketId: string, author: string, body: string): Promise<TicketComment> {
  const [row] = await db
    .insert(ticketComments)
    .values({ ticketId, author, body: body.slice(0, COMMENT_MAX) })
    .returning();
  await appendEvent(ticketId, author, `commented: ${excerpt(body)}`);
  return serializeComment(row);
}

/** Rewrites a comment's text and stamps it edited. Scoped to the ticket. */
export async function updateComment(
  ticketId: string,
  commentId: number,
  body: string,
): Promise<TicketComment | null> {
  const rows = await db
    .update(ticketComments)
    .set({ body: body.slice(0, COMMENT_MAX), editedAt: new Date() })
    .where(and(eq(ticketComments.id, commentId), eq(ticketComments.ticketId, ticketId)))
    .returning();
  return rows[0] ? serializeComment(rows[0]) : null;
}

export async function deleteComment(ticketId: string, commentId: number): Promise<boolean> {
  const rows = await db
    .delete(ticketComments)
    .where(and(eq(ticketComments.id, commentId), eq(ticketComments.ticketId, ticketId)))
    .returning({ id: ticketComments.id });
  return rows.length > 0;
}
