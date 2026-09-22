"use client";

import { useMemo, useState } from "react";
import { PEOPLE, STATUSES, statusLabel, type Status } from "@/lib/constants";
import { ago, absolute } from "@/lib/time";
import type { Ticket } from "@/lib/types";
import { Rich, WhoChip } from "./ui";

export type Filters = { q: string; person: string; kind: string };

function matches(t: Ticket, f: Filters): boolean {
  if (f.kind && t.kind !== f.kind) return false;
  if (f.person === "__none" && t.assignee) return false;
  if (f.person && f.person !== "__none" && t.assignee !== f.person) return false;
  if (f.q) {
    const hay = `${t.title} ${t.notes} ${t.branch}`.toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

function Card({
  t,
  now,
  canWrite,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  t: Ticket;
  now: number;
  canWrite: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  return (
    <button
      type="button"
      className={`card${dragging ? " dragging" : ""}${canWrite ? "" : " readonly"}`}
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
    >
      <span className="t">
        <Rich text={t.title} />
      </span>
      <span className="meta">
        <span className={`pill ${t.kind === "question" ? "q" : "f"}`}>
          {t.kind === "question" ? "Question" : "Feature"}
        </span>
        {t.section !== "Unsorted" && <span className="pill sec">{t.section}</span>}
        {t.assignee && <WhoChip handle={t.assignee} />}
        <span className="when" title={absolute(t.updated_at)}>
          {ago(t.updated_at, now)}
        </span>
      </span>
      {t.branch && (
        <span className="meta">
          <span className="branch">{t.branch}</span>
        </span>
      )}
    </button>
  );
}

export function BoardTab({
  tickets,
  now,
  canWrite,
  onOpen,
  onAdd,
  onBulk,
  onMove,
}: {
  tickets: Ticket[];
  now: number;
  canWrite: boolean;
  onOpen: (t: Ticket) => void;
  onAdd: () => void;
  onBulk: () => void;
  onMove: (t: Ticket, status: Status) => void;
}) {
  const [filters, setFilters] = useState<Filters>({ q: "", person: "", kind: "" });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...tickets].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [tickets],
  );

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search tickets"
          aria-label="Search tickets"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select
          aria-label="Filter by person"
          value={filters.person}
          onChange={(e) => setFilters((f) => ({ ...f, person: e.target.value }))}
        >
          <option value="">Everyone</option>
          <option value="__none">Unassigned</option>
          {PEOPLE.map((p) => (
            <option key={p.id} value={p.id}>
              @{p.id}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by type"
          value={filters.kind}
          onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}
        >
          <option value="">Features and questions</option>
          <option value="feature">Features</option>
          <option value="question">Questions</option>
        </select>
        <span className="spacer" />
        <button className="btn" onClick={onBulk} disabled={!canWrite}>
          Paste a list
        </button>
        <button className="btn primary" onClick={onAdd}>
          Add ticket
        </button>
      </div>

      <div className="board">
        {STATUSES.map((s) => {
          const inColumn = sorted.filter((t) => t.status === s.id);
          const shown = inColumn.filter((t) => matches(t, filters));
          return (
            <div
              key={s.id}
              className={`col${overCol === s.id ? " over" : ""}`}
              data-s={s.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverCol(s.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                const t = dragId ? tickets.find((x) => x.id === dragId) : null;
                setDragId(null);
                if (t && t.status !== s.id) onMove(t, s.id);
              }}
            >
              <div className="col-h">
                <span className="dot" />
                {s.label}
                {/* filtered/total, because a board that hides the real backlog size is a lie */}
                <span className="n">
                  {shown.length === inColumn.length
                    ? inColumn.length
                    : `${shown.length}/${inColumn.length}`}
                </span>
              </div>
              <div className="list">
                {shown.length ? (
                  shown.map((t) => (
                    <Card
                      key={t.id}
                      t={t}
                      now={now}
                      canWrite={canWrite}
                      dragging={dragId === t.id}
                      onOpen={() => onOpen(t)}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                    />
                  ))
                ) : (
                  <div className="empty">
                    {inColumn.length
                      ? "No tickets match the filters."
                      : `Nothing in ${statusLabel(s.id).toLowerCase()} yet.`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
