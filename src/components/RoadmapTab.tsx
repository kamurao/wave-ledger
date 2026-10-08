"use client";

import { useMemo, useState } from "react";
import { STATUSES } from "@/lib/constants";
import { byRank, daysUntil, formatDate, progressOf } from "@/lib/board";
import type { Epic, Milestone, Ticket } from "@/lib/types";
import { EpicChip, KindPill, PriorityBadge, ProgressBar, Rich, StatusPill, WhoChip } from "./ui";

const STATUS_ORDER = new Map<string, number>(STATUSES.map((s, i) => [s.id, i]));
const stageSort = (a: Ticket, b: Ticket) =>
  // Furthest along first: what is closest to done is what the milestone is waiting on.
  (STATUS_ORDER.get(b.status) ?? 0) - (STATUS_ORDER.get(a.status) ?? 0) || byRank(a, b);

function Row({ t, onOpen }: { t: Ticket; onOpen: (t: Ticket) => void }) {
  return (
    <li>
      <button type="button" className="rm-row" onClick={() => onOpen(t)}>
        <span className="num">#{t.number}</span>
        <StatusPill status={t.status} />
        <PriorityBadge priority={t.priority} />
        <span className="rm-title">
          <Rich text={t.title} />
        </span>
        <KindPill kind={t.kind} />
        {t.assignee && <WhoChip handle={t.assignee} />}
      </button>
    </li>
  );
}

/**
 * Milestones in order, each with the epics inside it. This is the plan view:
 * what has to be true by when, and how far along each piece is.
 */
export function RoadmapTab({
  milestones,
  epics,
  tickets,
  now,
  canWrite,
  onNewMilestone,
  onEditMilestone,
  onOpen,
}: {
  milestones: Milestone[];
  epics: Epic[];
  tickets: Ticket[];
  now: number;
  canWrite: boolean;
  onNewMilestone: () => void;
  onEditMilestone: (m: Milestone) => void;
  onOpen: (t: Ticket) => void;
}) {
  const [showDone, setShowDone] = useState<Record<string, boolean>>({});
  const byId = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const epicById = useMemo(() => new Map(epics.map((e) => [e.id, e])), [epics]);

  const groups = useMemo(() => {
    const make = (list: Ticket[]) => {
      const lanes = new Map<string | null, Ticket[]>();
      for (const t of list) lanes.set(t.epic_id, [...(lanes.get(t.epic_id) ?? []), t]);
      const order = [...epics.map((e) => e.id), null];
      return order
        .filter((id) => lanes.has(id))
        .map((id) => ({ id, tickets: (lanes.get(id) ?? []).sort(stageSort) }));
    };
    const sections = milestones.map((m) => {
      const list = tickets.filter((t) => t.milestone_id === m.id);
      return { milestone: m as Milestone | null, list, lanes: make(list), p: progressOf(list, byId) };
    });
    const unscheduled = tickets.filter((t) => !t.milestone_id && t.status !== "done");
    sections.push({
      milestone: null,
      list: unscheduled,
      lanes: make(unscheduled),
      p: progressOf(unscheduled, byId),
    });
    return sections;
  }, [milestones, epics, tickets, byId]);

  return (
    <section>
      <div className="toolbar">
        <span className="sub-inline">
          {milestones.length} milestone{milestones.length === 1 ? "" : "s"}
        </span>
        <span className="spacer" />
        <button className="btn primary" onClick={onNewMilestone} disabled={!canWrite}>
          New milestone
        </button>
      </div>

      <div className="roadmap">
        {groups.map(({ milestone: m, list, lanes, p }) => {
          if (!m && list.length === 0) return null;
          const key = m?.id ?? "__unscheduled";
          const days = m && m.status !== "done" ? daysUntil(m.target_date, now) : null;
          const open = list.filter((t) => t.status !== "done");
          const doneN = list.length - open.length;
          const reveal = showDone[key];

          return (
            <article key={key} className={`milestone${m?.status === "active" ? " active" : ""}${m?.status === "done" ? " finished" : ""}`}>
              <header>
                <div>
                  <h3>{m ? m.name : "Unscheduled"}</h3>
                  <p className="goal">
                    {m ? m.goal || <em>No goal written yet.</em> : "Open tickets that are not tied to a milestone yet."}
                  </p>
                </div>
                <div className="when-box">
                  {m?.status && <span className={`pill ms-${m.status}`}>{m.status}</span>}
                  {m?.target_date && (
                    <span className={`due${days !== null && days < 0 ? " late" : ""}`}>
                      {formatDate(m.target_date)}
                      {days !== null && (
                        <small>{days < 0 ? `${-days}d overdue` : days === 0 ? "today" : `${days}d left`}</small>
                      )}
                    </span>
                  )}
                  {m && (
                    <button className="btn sm" onClick={() => onEditMilestone(m)}>
                      Edit
                    </button>
                  )}
                </div>
              </header>

              <ProgressBar p={p} />
              <div className="stats">
                <span>
                  <b>{p.done}</b>/{p.total} done
                </span>
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

              {lanes.map(({ id, tickets: rows }) => {
                const shown = reveal ? rows : rows.filter((t) => t.status !== "done");
                if (shown.length === 0) return null;
                return (
                  <div className="rm-lane" key={id ?? "none"}>
                    <div className="rm-lane-h">
                      {id ? <EpicChip epic={epicById.get(id)} /> : <span className="epic-chip none">No epic</span>}
                      <span className="n">
                        {rows.filter((t) => t.status === "done").length}/{rows.length}
                      </span>
                    </div>
                    <ul>
                      {shown.map((t) => (
                        <Row key={t.id} t={t} onOpen={onOpen} />
                      ))}
                    </ul>
                  </div>
                );
              })}

              {list.length === 0 && <div className="empty">Nothing is scheduled for this milestone yet.</div>}
              {doneN > 0 && m && (
                <button className="btn sm" onClick={() => setShowDone({ ...showDone, [key]: !reveal })}>
                  {reveal ? "Hide" : "Show"} {doneN} finished
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
