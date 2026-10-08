"use client";

import { useEffect, useRef, useState } from "react";
import { KINDS, STATUSES } from "@/lib/constants";
import { createTicket, type ApiError } from "@/lib/client";
import type { Epic, Milestone } from "@/lib/types";

/**
 * Bulk create, one ticket per line. With the type left on Auto, a line ending in
 * `?` becomes a question and everything else a feature. Still the fastest way
 * to dump a meeting's output onto the board.
 */
export function BulkDialog({
  open,
  me,
  epics,
  milestones,
  onClose,
  onChanged,
}: {
  open: boolean;
  me: string;
  epics: Epic[];
  milestones: Milestone[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("auto");
  const [status, setStatus] = useState("backlog");
  const [epic, setEpic] = useState("");
  const [milestone, setMilestone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    if (open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    let made = 0;
    for (const line of lines) {
      try {
        await createTicket(
          {
            title: line,
            kind: kind === "auto" ? (/\?$/.test(line) ? "question" : "feature") : kind,
            status,
            epic_id: epic || null,
            milestone_id: milestone || null,
          },
          me,
        );
        made += 1;
      } catch (err) {
        setError(`Stopped after ${made} of ${lines.length}: ${(err as ApiError).message}`);
        setBusy(false);
        onChanged();
        return;
      }
    }
    setText("");
    onChanged();
    onClose();
  }

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h3>Paste a list</h3>
        <p className="hint">
          One ticket per line. With Type on Auto, lines ending in a question mark become questions
          and everything else becomes a feature.
        </p>
        <label className="f" htmlFor="bulkText">
          Tickets
          <textarea
            id="bulkText"
            style={{ minHeight: 160 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="row2">
          <label className="f" htmlFor="bulkKind">
            Type
            <select id="bulkKind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="auto">Auto</option>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="f" htmlFor="bulkStatus">
            Column
            <select id="bulkStatus" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row2">
          <label className="f" htmlFor="bulkEpic">
            Epic
            <select id="bulkEpic" value={epic} onChange={(e) => setEpic(e.target.value)}>
              <option value="">No epic</option>
              {epics
                .filter((e) => e.status !== "archived")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="f" htmlFor="bulkMilestone">
            Milestone
            <select id="bulkMilestone" value={milestone} onChange={(e) => setMilestone(e.target.value)}>
              <option value="">Unscheduled</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="note err">{error}</p>}
        <div className="actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Adding…" : "Add tickets"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
