"use client";

import { useEffect, useRef, useState } from "react";
import { EPIC_COLORS, EPIC_STATUSES, MILESTONE_STATUSES, PEOPLE } from "@/lib/constants";
import {
  createEpic,
  createMilestone,
  deleteEpic,
  deleteMilestone,
  patchEpic,
  patchMilestone,
  type ApiError,
  type EpicFields,
  type MilestoneFields,
} from "@/lib/client";
import type { Epic, Milestone } from "@/lib/types";

/** Shared open/close plumbing for a native <dialog>. */
function useDialog(open: boolean, reset: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return ref;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function EpicDialog({
  open,
  epic,
  canWrite,
  canDelete,
  onClose,
  onChanged,
}: {
  open: boolean;
  epic: Epic | null;
  canWrite: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const blank: EpicFields = { name: "", summary: "", color: "e1", status: "active", owner: null };
  const initial = (): EpicFields =>
    epic
      ? { name: epic.name, summary: epic.summary, color: epic.color, status: epic.status, owner: epic.owner }
      : blank;
  const [form, setForm] = useState<EpicFields>(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const ref = useDialog(open, () => {
    setForm(initial());
    setError(null);
    setBusy(false);
    setArmed(false);
  });
  const set = <K extends keyof EpicFields>(k: K, v: EpicFields[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite || busy) return;
    if (!form.name.trim()) {
      setError("An epic needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (epic) {
        const base = initial();
        const patch: Partial<EpicFields> = {};
        for (const k of Object.keys(form) as (keyof EpicFields)[]) {
          if ((base[k] ?? "") !== (form[k] ?? "")) patch[k] = form[k] as never;
        }
        if (Object.keys(patch).length) await patchEpic(epic.id, patch, epic.version);
      } else {
        await createEpic(form);
      }
      onChanged();
      onClose();
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.status === 409 ? "Someone else changed this epic. Close and reopen it." : e2.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!epic || !canDelete || busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await deleteEpic(epic.id);
      onChanged();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}>
      <form onSubmit={save}>
        <h3>{epic ? "Edit epic" : "New epic"}</h3>
        {epic && (
          <p className="hint">
            <code>{epic.id}</code> · v{epic.version}
          </p>
        )}

        <label className="f" htmlFor="eName">
          Name
          <input id="eName" required maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>

        <label className="f" htmlFor="eSummary">
          What it covers
          <textarea
            id="eSummary"
            maxLength={1000}
            placeholder="One or two sentences. What belongs in this epic, and what does not."
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
          />
        </label>

        <div className="f">
          Colour
          <div className="swatches" role="radiogroup" aria-label="Epic colour">
            {EPIC_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.color === c}
                aria-label={c}
                className={form.color === c ? "on" : ""}
                style={{ background: `var(--${c})` }}
                onClick={() => set("color", c)}
              />
            ))}
          </div>
        </div>

        <div className="row2">
          <label className="f" htmlFor="eStatus">
            Status
            <select id="eStatus" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {EPIC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="f" htmlFor="eOwner">
            Owner
            <select id="eOwner" value={form.owner ?? ""} onChange={(e) => set("owner", e.target.value || null)}>
              <option value="">Unowned</option>
              {PEOPLE.map((p) => (
                <option key={p.id} value={p.id}>
                  @{p.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="note err">{error}</p>}

        <div className="actions">
          <button type="submit" className="btn primary" disabled={!canWrite || busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <span className="spacer" />
          {epic && canDelete && (
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>
              {armed ? "Click again to delete" : "Delete"}
            </button>
          )}
        </div>
        {epic && canDelete && (
          <p className="hint">Deleting an epic keeps its tickets; they just lose the epic.</p>
        )}
        {!canWrite && <p className="hint">You need write access to change epics.</p>}
      </form>
    </dialog>
  );
}

export function MilestoneDialog({
  open,
  milestone,
  canWrite,
  canDelete,
  onClose,
  onChanged,
}: {
  open: boolean;
  milestone: Milestone | null;
  canWrite: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const blank: MilestoneFields = { name: "", goal: "", target_date: null, status: "upcoming" };
  const initial = (): MilestoneFields =>
    milestone
      ? {
          name: milestone.name,
          goal: milestone.goal,
          target_date: milestone.target_date,
          status: milestone.status,
        }
      : blank;
  const [form, setForm] = useState<MilestoneFields>(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const ref = useDialog(open, () => {
    setForm(initial());
    setError(null);
    setBusy(false);
    setArmed(false);
  });
  const set = <K extends keyof MilestoneFields>(k: K, v: MilestoneFields[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite || busy) return;
    if (!form.name.trim()) {
      setError("A milestone needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (milestone) {
        const base = initial();
        const patch: Partial<MilestoneFields> = {};
        for (const k of Object.keys(form) as (keyof MilestoneFields)[]) {
          if ((base[k] ?? "") !== (form[k] ?? "")) patch[k] = form[k] as never;
        }
        if (Object.keys(patch).length) await patchMilestone(milestone.id, patch, milestone.version);
      } else {
        await createMilestone(form);
      }
      onChanged();
      onClose();
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.status === 409 ? "Someone else changed this milestone. Close and reopen it." : e2.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!milestone || !canDelete || busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await deleteMilestone(milestone.id);
      onChanged();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}>
      <form onSubmit={save}>
        <h3>{milestone ? "Edit milestone" : "New milestone"}</h3>
        {milestone && (
          <p className="hint">
            <code>{milestone.id}</code> · v{milestone.version}
          </p>
        )}

        <label className="f" htmlFor="mName">
          Name
          <input id="mName" required maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>

        <label className="f" htmlFor="mGoal">
          Goal
          <textarea
            id="mGoal"
            maxLength={1000}
            placeholder="What is true when this milestone is done?"
            value={form.goal}
            onChange={(e) => set("goal", e.target.value)}
          />
        </label>

        <div className="row2">
          <label className="f" htmlFor="mDate">
            Target date
            <input
              id="mDate"
              type="date"
              value={form.target_date ?? ""}
              onChange={(e) => set("target_date", e.target.value || null)}
            />
          </label>
          <label className="f" htmlFor="mStatus">
            Status
            <select id="mStatus" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {MILESTONE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="note err">{error}</p>}

        <div className="actions">
          <button type="submit" className="btn primary" disabled={!canWrite || busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <span className="spacer" />
          {milestone && canDelete && (
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>
              {armed ? "Click again to delete" : "Delete"}
            </button>
          )}
        </div>
        {milestone && canDelete && (
          <p className="hint">Deleting a milestone keeps its tickets; they become unscheduled.</p>
        )}
        {!canWrite && <p className="hint">You need write access to change milestones.</p>}
      </form>
    </dialog>
  );
}
