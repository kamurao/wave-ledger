import { Fragment } from "react";
import { kindLabel, personFor, PRIORITIES, statusLabel } from "@/lib/constants";
import type { Progress } from "@/lib/board";
import type { Epic } from "@/lib/types";

/**
 * `**bold**` and nothing else.
 *
 * One rule, applied to titles and history text, so game keywords pop in a wall
 * of similar tickets. It is deliberately not markdown — see spec section 9.1.
 */
export function Rich({ text }: { text: string }) {
  const parts = String(text ?? "").split(/(\*\*.+?\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.length > 4 && p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function WhoChip({ handle, full = false }: { handle: string; full?: boolean }) {
  const p = personFor(handle);
  if (!p) {
    return (
      <span className="who-chip">
        <span className="av" style={{ background: "var(--todo)" }}>
          {handle.slice(0, 1).toUpperCase()}
        </span>
        {handle}
      </span>
    );
  }
  return (
    <span className="who-chip">
      <span className="av" style={{ background: p.color }}>
        {p.name.slice(0, 1).toUpperCase()}
      </span>
      {full ? `@${p.id}` : p.name}
    </span>
  );
}

export function KindPill({ kind }: { kind: string }) {
  return <span className={`pill k-${kind}`}>{kindLabel(kind)}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`prio ${priority}`} title={PRIORITIES.find((p) => p.id === priority)?.name}>
      {priority.toUpperCase()}
    </span>
  );
}

/** An epic's palette slot as a coloured dot plus its name. */
export function EpicChip({ epic, short = false }: { epic: Epic | undefined; short?: boolean }) {
  if (!epic) return null;
  return (
    <span className="epic-chip" style={{ "--ec": `var(--${epic.color})` } as React.CSSProperties}>
      <i />
      <span>{short ? epic.name.split(/[ &]/)[0] : epic.name}</span>
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`st ${status}`}>{statusLabel(status)}</span>;
}

/** Stacked share of a set of tickets by stage, finished work on the left. */
export function ProgressBar({ p }: { p: Progress }) {
  if (p.total === 0) return <div className="bar empty" aria-label="no tickets" />;
  const seg = (n: number, cls: string) =>
    n > 0 ? <span className={cls} style={{ width: `${(n / p.total) * 100}%` }} /> : null;
  return (
    <div
      className="bar"
      role="img"
      aria-label={`${p.done} of ${p.total} done, ${p.review} in review, ${p.in_progress} in progress`}
    >
      {seg(p.done, "s-done")}
      {seg(p.review, "s-review")}
      {seg(p.in_progress, "s-prog")}
      {seg(p.todo, "s-todo")}
      {seg(p.backlog, "s-backlog")}
    </div>
  );
}
