"use client";

import { useEffect, useRef, useState } from "react";
import { KINDS, PEOPLE, SECTIONS, STATUSES } from "@/lib/constants";
import { composeLink, LINK_FIELDS, type LinkField } from "@/lib/link";
import { ApiError, createTicket, deleteTicket, patchTicket, type TicketFields } from "@/lib/client";
import type { Ticket } from "@/lib/types";

const BLANK: TicketFields = {
  title: "",
  kind: "feature",
  status: "todo",
  assignee: null,
  section: "Unsorted",
  branch: "",
  notes: "",
};

function fieldsOf(t: Ticket | null): TicketFields {
  if (!t) return { ...BLANK };
  return {
    title: t.title,
    kind: t.kind,
    status: t.status,
    assignee: t.assignee,
    section: t.section,
    branch: t.branch,
    notes: t.notes,
  };
}

/** Only the fields the form actually altered. */
function diff(base: TicketFields, now: TicketFields): Partial<TicketFields> {
  const out: Partial<TicketFields> = {};
  for (const k of Object.keys(BLANK) as (keyof TicketFields)[]) {
    if ((base[k] ?? "") !== (now[k] ?? "")) {
      out[k] = now[k] as never;
    }
  }
  return out;
}

export function TicketDialog({
  open,
  ticket,
  canWrite,
  me,
  onClose,
  onChanged,
}: {
  open: boolean;
  ticket: Ticket | null;
  canWrite: boolean;
  me: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<TicketFields>(BLANK);
  const [base, setBase] = useState<TicketFields>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const f = fieldsOf(ticket);
    setForm(f);
    setBase(f);
    setError(null);
    setArmed(false);
    setLink(null);
    setBusy(false);
  }, [open, ticket]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const set = <K extends keyof TicketFields>(k: K, v: TicketFields[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite || busy) return;
    if (!form.title.trim()) {
      setError("A ticket needs a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (ticket) {
        const patch = diff(base, form);
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        await patchTicket(ticket.id, patch, ticket.version, me);
      } else {
        await createTicket(form, me);
      }
      onChanged();
      onClose();
    } catch (err) {
      const e2 = err as ApiError;
      setError(
        e2.status === 409
          ? "Someone else changed this ticket while you had it open. Close and reopen to see their version."
          : e2.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!ticket || !canWrite || busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await deleteTicket(ticket.id);
      onChanged();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  /**
   * Composing a link needs no permission — it is how a read-only visitor
   * contributes. Applying it is what needs write access.
   */
  function copyLink() {
    const origin = window.location.origin;
    let url: string;
    if (ticket) {
      const changed = diff(base, form);
      const fields: Partial<Record<LinkField, string>> = {};
      for (const f of LINK_FIELDS) {
        const v = changed[f as keyof TicketFields];
        if (v !== undefined) fields[f] = v === null ? "" : String(v);
      }
      if (Object.keys(fields).length === 0) {
        setLink(null);
        setError("Change a field first — a link with nothing in it does nothing.");
        return;
      }
      url = composeLink(origin, ticket.id, fields, me);
    } else {
      const sp = new URLSearchParams({ add: form.title.trim() });
      if (!form.title.trim()) {
        setError("Give the ticket a title first.");
        return;
      }
      for (const f of ["kind", "status", "section", "branch", "notes"] as LinkField[]) {
        const v = form[f as keyof TicketFields];
        if (v && String(v) !== String(BLANK[f as keyof TicketFields] ?? "")) sp.set(f, String(v));
      }
      if (form.assignee) sp.set("assignee", form.assignee);
      sp.set("by", me);
      url = `${origin}/?${sp.toString()}`;
    }
    setError(null);
    setLink(url);
    navigator.clipboard?.writeText(url).catch(() => {
      /* the box below is the fallback */
    });
  }

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}>
      <form onSubmit={save}>
        <h3>{ticket ? "Edit ticket" : "Add ticket"}</h3>

        {ticket && (
          <p className="hint">
            <code>{ticket.id}</code> · v{ticket.version}
          </p>
        )}

        <label className="f" htmlFor="fTitle">
          Title
          <input
            id="fTitle"
            required
            maxLength={300}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>

        <div className="row2">
          <label className="f" htmlFor="fKind">
            Type
            <select id="fKind" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === "feature" ? "Feature" : "Question"}
                </option>
              ))}
            </select>
          </label>
          <label className="f" htmlFor="fStatus">
            Status
            <select id="fStatus" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row2">
          <label className="f" htmlFor="fAssignee">
            Assignee
            <select
              id="fAssignee"
              value={form.assignee ?? ""}
              onChange={(e) => set("assignee", e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {PEOPLE.map((p) => (
                <option key={p.id} value={p.id}>
                  @{p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="f" htmlFor="fSection">
            List
            <select
              id="fSection"
              value={form.section}
              onChange={(e) => set("section", e.target.value)}
            >
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="f" htmlFor="fBranch">
          Branch
          <input
            id="fBranch"
            placeholder="feature/example"
            maxLength={200}
            value={form.branch}
            onChange={(e) => set("branch", e.target.value)}
          />
        </label>

        <label className="f" htmlFor="fNotes">
          Notes
          <textarea
            id="fNotes"
            maxLength={4000}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>

        <p className="hint">Wrap keywords in **double asterisks** to bold them.</p>

        {error && <p className="note err">{error}</p>}

        {link && (
          <div className="linkbox">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <span className="hint">copied</span>
          </div>
        )}

        <div className="actions">
          <button type="submit" className="btn primary" disabled={!canWrite || busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={copyLink}>
            Copy link
          </button>
          <span className="spacer" />
          {ticket && canWrite && (
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>
              {armed ? "Click again to delete" : "Delete"}
            </button>
          )}
        </div>

        {!canWrite && (
          <p className="hint">
            You are signed out or not on the writer list. Copy a link instead and send it to someone
            who can apply it.
          </p>
        )}
      </form>
    </dialog>
  );
}
