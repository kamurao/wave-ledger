"use client";

import { useMemo, useState } from "react";
import { progressOf } from "@/lib/board";
import type { Epic, Ticket } from "@/lib/types";
import { ProgressBar, WhoChip } from "./ui";

/**
 * One card per epic: how much of it is finished, how much is still a question,
 * and how much is stuck. "View on board" jumps to the board filtered to it.
 */
export function EpicsTab({
  epics,
  tickets,
  canWrite,
  onNew,
  onEdit,
  onView,
}: {
  epics: Epic[];
  tickets: Ticket[];
  canWrite: boolean;
  onNew: () => void;
  onEdit: (e: Epic) => void;
  onView: (epicId: string) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const byId = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);

  const cards = useMemo(() => {
    const visible = epics.filter((e) => showArchived || e.status !== "archived");
    return visible.map((e) => ({ epic: e, p: progressOf(tickets.filter((t) => t.epic_id === e.id), byId) }));
  }, [epics, tickets, byId, showArchived]);

  const loose = useMemo(() => tickets.filter((t) => !t.epic_id), [tickets]);
  const looseP = useMemo(() => progressOf(loose, byId), [loose, byId]);
  const archivedCount = epics.filter((e) => e.status === "archived").length;

  return (
    <section>
      <div className="toolbar">
        <span className="sub-inline">
          {cards.length} epic{cards.length === 1 ? "" : "s"} · {tickets.length} tickets
        </span>
        <span className="spacer" />
        {archivedCount > 0 && (
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived ({archivedCount})
          </label>
        )}
        <button className="btn primary" onClick={onNew} disabled={!canWrite}>
          New epic
        </button>
      </div>

      <div className="epic-grid">
        {cards.map(({ epic: e, p }) => (
          <article
            key={e.id}
            className={`epic-card${e.status === "archived" ? " archived" : ""}`}
            style={{ "--ec": `var(--${e.color})` } as React.CSSProperties}
          >
            <header>
              <h3>{e.name}</h3>
              {e.status !== "active" && <span className={`pill es-${e.status}`}>{e.status}</span>}
            </header>
            <p className="sum">{e.summary || <em>No description yet.</em>}</p>

            <ProgressBar p={p} />
            <div className="stats">
              <span>
                <b>{p.done}</b>/{p.total} done
              </span>
              {p.in_progress + p.review > 0 && (
                <span>
                  <b>{p.in_progress + p.review}</b> active
                </span>
              )}
              {p.openQuestions > 0 && (
                <span className="q">
                  <b>{p.openQuestions}</b> open question{p.openQuestions > 1 ? "s" : ""}
                </span>
              )}
              {p.blocked > 0 && (
                <span className="bad">
                  <b>{p.blocked}</b> blocked
                </span>
              )}
            </div>

            <footer>
              {e.owner ? <WhoChip handle={e.owner} /> : <span className="hint">Unowned</span>}
              <span className="grow" />
              <button className="btn sm" onClick={() => onView(e.id)}>
                View on board
              </button>
              <button className="btn sm" onClick={() => onEdit(e)}>
                Edit
              </button>
            </footer>
          </article>
        ))}

        {loose.length > 0 && (
          <article className="epic-card loose">
            <header>
              <h3>No epic</h3>
            </header>
            <p className="sum">Tickets that have not been filed under an epic yet.</p>
            <ProgressBar p={looseP} />
            <div className="stats">
              <span>
                <b>{looseP.done}</b>/{looseP.total} done
              </span>
            </div>
            <footer>
              <span className="grow" />
              <button className="btn sm" onClick={() => onView("__none")}>
                View on board
              </button>
            </footer>
          </article>
        )}
      </div>

      {cards.length === 0 && (
        <div className="empty">
          No epics yet. An epic is a chunk of the game — Combat, Economy, Narrative — that tickets roll up into.
        </div>
      )}
    </section>
  );
}
