"use client";

import { useEffect, useMemo, useState } from "react";
import { KINDS, PEOPLE, PRIORITIES, STATUSES, type Status } from "@/lib/constants";
import { byRank, checklist, isBlocked, openDeps } from "@/lib/board";
import { ago, absolute } from "@/lib/time";
import type { Epic, Milestone, Ticket } from "@/lib/types";
import { EpicChip, KindPill, PriorityBadge, Rich, WhoChip } from "./ui";

export type Filters = {
  q: string;
  person: string;
  kind: string;
  epic: string;
  milestone: string;
  priority: string;
  blockedOnly: boolean;
};

export const NO_FILTERS: Filters = {
  q: "",
  person: "",
  kind: "",
  epic: "",
  milestone: "",
  priority: "",
  blockedOnly: false,
};

export function filtersActive(f: Filters): boolean {
  return Object.entries(f).some(([, v]) => v !== "" && v !== false);
}

export function matches(t: Ticket, f: Filters, byId: Map<string, Ticket>): boolean {
  if (f.kind && t.kind !== f.kind) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.person === "__none" && t.assignee) return false;
  if (f.person && f.person !== "__none" && t.assignee !== f.person) return false;
  if (f.epic === "__none" && t.epic_id) return false;
  if (f.epic && f.epic !== "__none" && t.epic_id !== f.epic) return false;
  if (f.milestone === "__none" && t.milestone_id) return false;
  if (f.milestone && f.milestone !== "__none" && t.milestone_id !== f.milestone) return false;
  if (f.blockedOnly && !isBlocked(t, byId)) return false;
  if (f.q) {
    const hay = `#${t.number} ${t.title} ${t.notes} ${t.branch} ${t.decision} ${t.labels.join(" ")} ${t.id}`.toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

type Over = { status: Status; lane: string | null; beforeId: string | null };

function Card({
  t,
  epic,
  byId,
  now,
  canWrite,
  dragging,
  dropBefore,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  t: Ticket;
  epic: Epic | undefined;
  byId: Map<string, Ticket>;
  now: number;
  canWrite: boolean;
  dragging: boolean;
  dropBefore: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLButtonElement>) => void;
}) {
  const list = checklist(t.criteria);
  const waiting = openDeps(t, byId);
  const blockedByHand = t.status !== "done" && t.blocked_reason.trim() !== "";
  return (
    <button
      type="button"
      className={`card${dragging ? " dragging" : ""}${canWrite ? "" : " readonly"}${
        dropBefore ? " drop-before" : ""
      }${t.priority === "p0" && t.status !== "done" ? " p0" : ""}`}
      draggable={canWrite}
      onClick={onOpen}
      onDragStart={(e) => {
        if (!canWrite) return;
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", t.id);
        } catch {
          /* Safari is picky about setData timing */
        }
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      <span className="meta top">
        <span className="num">#{t.number}</span>
        <KindPill kind={t.kind} />
        {(t.priority === "p0" || t.priority === "p1") && <PriorityBadge priority={t.priority} />}
        {t.estimate && <span className="est">{t.estimate}</span>}
        <span className="grow" />
        {t.assignee && <WhoChip handle={t.assignee} />}
      </span>

      <span className="t">
        <Rich text={t.title} />
      </span>

      {(epic || t.labels.length > 0) && (
        <span className="meta">
          <EpicChip epic={epic} />
          {t.labels.slice(0, 3).map((l) => (
            <span key={l} className="label">
              {l}
            </span>
          ))}
          {t.labels.length > 3 && <span className="label">+{t.labels.length - 3}</span>}
        </span>
      )}

      {(blockedByHand || waiting.length > 0) && (
        <span
          className={`blocked${blockedByHand ? "" : " wait"}`}
          title={t.blocked_reason || waiting.map((w) => w.title.replace(/\*\*/g, "")).join("\n")}
        >
          <b>{blockedByHand ? "Blocked" : "Waiting"}</b>{" "}
          {blockedByHand ? t.blocked_reason : `on ${waiting.length} ticket${waiting.length > 1 ? "s" : ""}`}
        </span>
      )}

      <span className="meta foot">
        {list.total > 0 && (
          <span className={`chk${list.done === list.total ? " all" : ""}`} title="Acceptance criteria">
            {list.done}/{list.total}
          </span>
        )}
        {t.decision && <span className="decided">Decided</span>}
        {t.design_doc && <span className="doc-tag">Spec</span>}
        {t.branch && <span className="branch">{t.branch}</span>}
        <span className="when" title={absolute(t.updated_at)}>
          {ago(t.updated_at, now)}
        </span>
      </span>
    </button>
  );
}

const DONE_LIMIT = 12;

export function BoardTab({
  tickets,
  epics,
  milestones,
  filters,
  setFilters,
  now,
  canWrite,
  onOpen,
  onAdd,
  onBulk,
  onPlace,
}: {
  tickets: Ticket[];
  epics: Epic[];
  milestones: Milestone[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  now: number;
  canWrite: boolean;
  onOpen: (t: Ticket) => void;
  onAdd: (status: Status, epicId: string | null) => void;
  onBulk: () => void;
  /** Move a card to a column, above `beforeId` (null = bottom). `epicId` re-homes it when swimlanes are on. */
  onPlace: (t: Ticket, status: Status, beforeId: string | null, epicId: string | null | undefined) => void;
}) {
  const [lanes, setLanes] = useState(false);
  // Per-viewer convenience, read after mount so the server render and the first
  // client render agree.
  useEffect(() => {
    try {
      setLanes(localStorage.getItem("wl-lanes") === "1");
    } catch {
      /* no storage, keep the default */
    }
  }, []);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);

  const byId = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const epicById = useMemo(() => new Map(epics.map((e) => [e.id, e])), [epics]);
  const sorted = useMemo(() => [...tickets].sort(byRank), [tickets]);
  const shownIds = useMemo(
    () => new Set(sorted.filter((t) => matches(t, filters, byId)).map((t) => t.id)),
    [sorted, filters, byId],
  );

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters({ ...filters, [k]: v });
  const toggleLanes = (on: boolean) => {
    setLanes(on);
    try {
      localStorage.setItem("wl-lanes", on ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
  };

  const liveEpics = epics.filter((e) => e.status !== "archived" || tickets.some((t) => t.epic_id === e.id));
  const laneIds: (string | null | undefined)[] = lanes
    ? [
        ...liveEpics.filter((e) => sorted.some((t) => t.epic_id === e.id && shownIds.has(t.id))).map((e) => e.id),
        ...(sorted.some((t) => !t.epic_id && shownIds.has(t.id)) ? [null] : []),
      ]
    : [undefined];

  function renderCells(lane: string | null | undefined) {
    return (
      <div className="board">
        {STATUSES.map((s) => {
          const inLane = sorted.filter(
            (t) => t.status === s.id && (lane === undefined || (t.epic_id ?? null) === lane),
          );
          const shown = inLane.filter((t) => shownIds.has(t.id));
          const capped = s.id === "done" && !showAllDone && lane === undefined && shown.length > DONE_LIMIT;
          const visible = capped ? shown.slice(0, DONE_LIMIT) : shown;
          const laneKey = lane === undefined ? null : (lane ?? "");
          const isOver = over?.status === s.id && over.lane === laneKey;
          const filtered = filtersActive(filters);

          return (
            <div
              key={s.id}
              className={`col${isOver ? " over" : ""}`}
              data-s={s.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOver({ status: s.id, lane: laneKey, beforeId: null });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const target = over;
                setOver(null);
                const t = dragId ? byId.get(dragId) : null;
                setDragId(null);
                if (!t || !target || target.beforeId === t.id) return;
                onPlace(t, s.id, target.beforeId, lane === undefined ? undefined : lane);
              }}
            >
              <div className="col-h" title={s.hint}>
                <span className="dot" />
                {s.label}
                {/* filtered/total, because a board that hides the real backlog size is a lie */}
                <span className="n">
                  {filtered && shown.length !== inLane.length ? `${shown.length}/${inLane.length}` : inLane.length}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    className="add"
                    aria-label={`Add a ticket to ${s.label}`}
                    title={`Add to ${s.label}`}
                    onClick={() => onAdd(s.id, lane ?? (filters.epic && filters.epic !== "__none" ? filters.epic : null))}
                  >
                    +
                  </button>
                )}
              </div>
              <div className={`list${isOver && over?.beforeId === null ? " drop-end" : ""}`}>
                {visible.length ? (
                  visible.map((t, i) => (
                    <Card
                      key={t.id}
                      t={t}
                      epic={t.epic_id ? epicById.get(t.epic_id) : undefined}
                      byId={byId}
                      now={now}
                      canWrite={canWrite}
                      dragging={dragId === t.id}
                      dropBefore={isOver && over?.beforeId === t.id && dragId !== t.id}
                      onOpen={() => onOpen(t)}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const above = e.clientY < r.top + r.height / 2;
                        const next = visible[i + 1]?.id ?? null;
                        setOver({ status: s.id, lane: laneKey, beforeId: above ? t.id : next });
                      }}
                    />
                  ))
                ) : (
                  <div className="empty">
                    {inLane.length ? "No tickets match the filters." : "Nothing here."}
                  </div>
                )}
                {capped && (
                  <button type="button" className="btn sm more-done" onClick={() => setShowAllDone(true)}>
                    Show {shown.length - DONE_LIMIT} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search tickets"
          aria-label="Search tickets"
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
        />
        <select aria-label="Filter by epic" value={filters.epic} onChange={(e) => set("epic", e.target.value)}>
          <option value="">All epics</option>
          <option value="__none">No epic</option>
          {epics
            .filter((e) => e.status !== "archived" || filters.epic === e.id)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Filter by milestone"
          value={filters.milestone}
          onChange={(e) => set("milestone", e.target.value)}
        >
          <option value="">All milestones</option>
          <option value="__none">Unscheduled</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by person" value={filters.person} onChange={(e) => set("person", e.target.value)}>
          <option value="">Everyone</option>
          <option value="__none">Unassigned</option>
          {PEOPLE.map((p) => (
            <option key={p.id} value={p.id}>
              @{p.id}
            </option>
          ))}
        </select>
        <select aria-label="Filter by type" value={filters.kind} onChange={(e) => set("kind", e.target.value)}>
          <option value="">All types</option>
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by priority"
          value={filters.priority}
          onChange={(e) => set("priority", e.target.value)}
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} {p.name}
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.blockedOnly}
            onChange={(e) => set("blockedOnly", e.target.checked)}
          />
          Blocked
        </label>
        {filtersActive(filters) && (
          <button className="btn sm" onClick={() => setFilters(NO_FILTERS)}>
            Clear
          </button>
        )}
        <span className="spacer" />
        <label className="check" title="Group the board into one row per epic. Dropping a card into another row moves it to that epic.">
          <input type="checkbox" checked={lanes} onChange={(e) => toggleLanes(e.target.checked)} />
          Swimlanes by epic
        </label>
        <button className="btn" onClick={onBulk} disabled={!canWrite}>
          Paste a list
        </button>
        <button
          className="btn primary"
          onClick={() => onAdd("backlog", filters.epic && filters.epic !== "__none" ? filters.epic : null)}
        >
          Add ticket
        </button>
      </div>

      <div className="board-scroll">
        {lanes ? (
          laneIds.length ? (
            laneIds.map((id) => {
              const e = id ? epicById.get(id) : undefined;
              const n = sorted.filter((t) => (t.epic_id ?? null) === id && shownIds.has(t.id)).length;
              return (
                <div className="lane" key={id ?? "none"}>
                  <div className="lane-h">
                    {e ? <EpicChip epic={e} /> : <span className="epic-chip none">No epic</span>}
                    <span className="n">{n}</span>
                    {e?.summary && <span className="lane-sum">{e.summary}</span>}
                  </div>
                  {renderCells(id)}
                </div>
              );
            })
          ) : (
            <div className="empty">No tickets match the filters.</div>
          )
        ) : (
          renderCells(undefined)
        )}
      </div>
    </section>
  );
}
