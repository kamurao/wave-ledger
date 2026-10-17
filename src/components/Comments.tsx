"use client";

import { useState } from "react";
import { ApiError, addComment, deleteComment, editComment } from "@/lib/client";
import { ago, absolute } from "@/lib/time";
import type { TicketComment } from "@/lib/types";

const MAX = 4000;

/**
 * The discussion on one ticket, oldest first, with a box to add to it.
 *
 * Your own comments (credited to the "Working as" handle) can be edited and
 * deleted; a signed-in writer can delete anyone's, mirroring the server.
 */
export function Comments({
  ticketId,
  comments,
  canWrite,
  canDelete,
  me,
  onChanged,
}: {
  ticketId: string;
  comments: TicketComment[];
  canWrite: boolean;
  canDelete: boolean;
  me: string;
  onChanged: () => void | Promise<unknown>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [armed, setArmed] = useState<number | null>(null);

  const mine = (c: TicketComment) => c.author === `@${me}`;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (err) {
      setError((err as ApiError).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function post() {
    const body = draft.trim();
    if (!body || busy) return;
    if (await run(() => addComment(ticketId, body, me))) setDraft("");
  }

  async function saveEdit(id: number) {
    const body = editText.trim();
    if (!body || busy) return;
    if (await run(() => editComment(ticketId, id, body, me))) setEditing(null);
  }

  async function remove(id: number) {
    if (armed !== id) {
      setArmed(id);
      return;
    }
    setArmed(null);
    await run(() => deleteComment(ticketId, id, me));
  }

  /** Ctrl/Cmd+Enter sends, so the box never submits the ticket form around it. */
  const sendKey = (e: React.KeyboardEvent, go: () => void) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      go();
    }
  };

  return (
    <section className="comments" aria-label="Comments">
      <h4>
        Comments <span className="count">{comments.length}</span>
      </h4>

      {comments.length === 0 ? (
        <p className="hint">No comments yet.</p>
      ) : (
        <ul className="cmt-list">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="cmt-head">
                <span className="by">{c.author}</span>
                <time title={absolute(c.at)}>{ago(c.at)}</time>
                {c.edited_at && (
                  <span className="edited" title={`edited ${absolute(c.edited_at)}`}>
                    edited
                  </span>
                )}
                <span className="spacer" />
                {canWrite && mine(c) && editing !== c.id && (
                  <button
                    type="button"
                    className="cmt-act"
                    onClick={() => {
                      setEditing(c.id);
                      setEditText(c.body);
                      setArmed(null);
                    }}
                  >
                    edit
                  </button>
                )}
                {canWrite && (mine(c) || canDelete) && (
                  <button type="button" className="cmt-act del" onClick={() => void remove(c.id)}>
                    {armed === c.id ? "click again to delete" : "delete"}
                  </button>
                )}
              </div>
              {editing === c.id ? (
                <div className="cmt-edit">
                  <textarea
                    aria-label="Edit comment"
                    maxLength={MAX}
                    value={editText}
                    autoFocus
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => sendKey(e, () => void saveEdit(c.id))}
                  />
                  <div className="cmt-actions">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy || !editText.trim()}
                      onClick={() => void saveEdit(c.id)}
                    >
                      Save comment
                    </button>
                    <button type="button" className="btn" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="cmt-body">{c.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className="cmt-new">
          <textarea
            aria-label="Write a comment"
            placeholder={`Comment as @${me}…`}
            maxLength={MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => sendKey(e, () => void post())}
          />
          <div className="cmt-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !draft.trim()}
              onClick={() => void post()}
            >
              {busy ? "Posting…" : "Comment"}
            </button>
            <span className="hint">Ctrl+Enter to post</span>
          </div>
        </div>
      ) : (
        <p className="hint">Sign in to comment.</p>
      )}

      {error && <p className="note err">{error}</p>}
    </section>
  );
}
