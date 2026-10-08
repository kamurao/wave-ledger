"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { ESTIMATES, KINDS, PEOPLE, PRIORITIES, STATUSES } from "@/lib/constants";
import { checklist, toggleLine } from "@/lib/board";
import { composeLink, LINK_FIELDS, LINK_TO_TICKET, type LinkField } from "@/lib/link";
import {
  ApiError,
  createTicket,
  deleteTicket,
  deleteTicketEvent,
  fetcher,
  patchTicket,
  type TicketFields,
} from "@/lib/client";
import { ago, absolute } from "@/lib/time";
import type { Epic, Milestone, Ticket, TicketEvent } from "@/lib/types";
import { Rich } from "./ui";

const BLANK: TicketFields = {
  title: "",
  kind: "feature",
  status: "backlog",
  assignee: null,
  epic_id: null,
  milestone_id: null,
  priority: "p2",
  estimate: null,
  labels: [],
  depends_on: [],
  blocked_reason: "",
  design_doc: "",
  criteria: "",
  decision: "",
  branch: "",
  notes: "",
};

export type NewTicketDefaults = Partial<TicketFields>;

function fieldsOf(t: Ticket | null, defaults?: NewTicketDefaults): TicketFields {
  if (!t) return { ...BLANK, ...defaults };
  return {
    title: t.title,
    kind: t.kind,
    status: t.status,
    assignee: t.assignee,
    epic_id: t.epic_id,
    milestone_id: t.milestone_id,
    priority: t.priority,
    estimate: t.estimate,
    labels: t.labels,
    depends_on: t.depends_on,
    blocked_reason: t.blocked_reason,
    design_doc: t.design_doc,
    criteria: t.criteria,
    decision: t.decision,
    branch: t.branch,
    notes: t.notes,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

/** Only the fields the form actually altered. */
function diff(base: TicketFields, now: TicketFields): Partial<TicketFields> {
  const out: Partial<TicketFields> = {};
  for (const k of Object.keys(BLANK) as (keyof TicketFields)[]) {
    if (!same(base[k], now[k])) out[k] = now[k] as never;
  }
  return out;
}

/** "Frost, burn  Slow" becomes ["frost","burn","slow"]; spaces inside a label become hyphens. */
function parseLabels(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const l = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (l && !out.includes(l)) out.push(l);
  }
  return out;
}

export function TicketDialog({
  open,
  ticket,
  defaults,
  tickets,
  epics,
  milestones,
  canWrite,
  canDelete,
  me,
  onClose,
  onChanged,
}: {
  open: boolean;
  ticket: Ticket | null;
  defaults?: NewTicketDefaults;
  tickets: Ticket[];
  epics: Epic[];
  milestones: Milestone[];
  canWrite: boolean;
  canDelete: boolean;
  me: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<TicketFields>(BLANK);
  const [base, setBase] = useState<TicketFields>(BLANK);
  const [labelsText, setLabelsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [addDep, setAddDep] = useState("");
  const [shared, setShared] = useState(false);

  /** The plain link to this ticket: short, permanent, and safe to paste anywhere. */
  function shareTicket() {
    if (!ticket) return;
    const url = `${window.location.origin}/t/${ticket.number}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      },
      () => setLink(url),
    );
  }

  useEffect(() => {
    if (!open) return;
    const f = fieldsOf(ticket, defaults);
    setForm(f);
    setBase(f);
    setLabelsText(f.labels.join(", "));
    setError(null);
    setArmed(false);
    setLink(null);
    setBusy(false);
    setAddDep("");
  }, [open, ticket, defaults]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const { data: detail, mutate: reloadDetail } = useSWR<{ events: TicketEvent[] }>(
    open && ticket ? `/api/tickets/${encodeURIComponent(ticket.id)}` : null,
    fetcher,
  );
  const [armedEvent, setArmedEvent] = useState<number | null>(null);

  async function removeEvent(eventId: number) {
    if (!ticket) return;
    if (armedEvent !== eventId) {
      setArmedEvent(eventId);
      return;
    }
    try {
      await deleteTicketEvent(ticket.id, eventId);
      setArmedEvent(null);
      await reloadDetail();
      onChanged();
    } catch (err) {
      setArmedEvent(null);
      setError((err as ApiError).message);
    }
  }

  const set = <K extends keyof TicketFields>(k: K, v: TicketFields[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const current = useMemo(() => ({ ...form, labels: parseLabels(labelsText) }), [form, labelsText]);
  const list = useMemo(() => checklist(form.criteria), [form.criteria]);
  const byId = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const depChoices = tickets
    .filter((t) => t.id !== ticket?.id && !form.depends_on.includes(t.id))
    .sort((a, b) => a.title.localeCompare(b.title));

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
        const patch = diff(base, current);
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        await patchTicket(ticket.id, patch, ticket.version, me);
      } else {
        await createTicket(current, me);
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
    if (!ticket || !canDelete || busy) return;
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
      const changed = diff(base, current) as Record<string, unknown>;
      const fields: Partial<Record<LinkField, string>> = {};
      for (const f of LINK_FIELDS) {
        const v = changed[LINK_TO_TICKET[f]];
        if (v !== undefined) fields[f] = v === null ? "" : String(v);
      }
      if (Object.keys(fields).length === 0) {
        setLink(null);
        setError("Change a field first — a link with nothing in it does nothing.");
        return;
      }
      url = composeLink(origin, ticket.id, fields, me);
    } else {
      if (!form.title.trim()) {
        setError("Give the ticket a title first.");
        return;
      }
      const sp = new URLSearchParams({ add: form.title.trim() });
      const c = current as Record<string, unknown>;
      for (const f of LINK_FIELDS) {
        if (f === "title") continue;
        const v = c[LINK_TO_TICKET[f]];
        const dflt = (BLANK as Record<string, unknown>)[LINK_TO_TICKET[f]];
        if (v && String(v) !== String(dflt ?? "")) sp.set(f, String(v));
      }
      sp.set("by", me);
      url = `${origin}/?${sp.toString()}`;
    }
    setError(null);
    setLink(url);
    navigator.clipboard?.writeText(url).catch(() => {
      /* the box below is the fallback */
    });
  }

  const showDecision = form.kind === "question" || form.decision !== "";

  return (
    <dialog ref={ref} className="wide" onClose={onClose} onCancel={onClose}>
      <form onSubmit={save}>
        <h3>{ticket ? "Edit ticket" : "Add ticket"}</h3>

        {ticket && (
          <p className="hint">
            <b className="num">#{ticket.number}</b> · <code>{ticket.id}</code> · v{ticket.version}
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
                <option key={k.id} value={k.id}>
                  {k.label} — {k.hint}
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
          <label className="f" htmlFor="fEpic">
            Epic
            <select
              id="fEpic"
              value={form.epic_id ?? ""}
              onChange={(e) => set("epic_id", e.target.value || null)}
            >
              <option value="">No epic</option>
              {epics
                .filter((e) => e.status !== "archived" || e.id === form.epic_id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="f" htmlFor="fMilestone">
            Milestone
            <select
              id="fMilestone"
              value={form.milestone_id ?? ""}
              onChange={(e) => set("milestone_id", e.target.value || null)}
            >
              <option value="">Unscheduled</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row3">
          <label className="f" htmlFor="fPriority">
            Priority
            <select id="fPriority" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="f" htmlFor="fEstimate">
            Size
            <select
              id="fEstimate"
              value={form.estimate ?? ""}
              onChange={(e) => set("estimate", e.target.value || null)}
            >
              <option value="">Unsized</option>
              {ESTIMATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
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
        </div>

        <label className="f" htmlFor="fLabels">
          Labels
          <input
            id="fLabels"
            placeholder="comma, separated, lowercase"
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
          />
        </label>

        <div className="f">
          Depends on
          {form.depends_on.length > 0 && (
            <ul className="deps">
              {form.depends_on.map((id) => {
                const d = byId.get(id);
                return (
                  <li key={id} className={d?.status === "done" ? "met" : ""}>
                    <span>{d ? <Rich text={d.title} /> : id}</span>
                    <button
                      type="button"
                      aria-label={`Remove dependency ${id}`}
                      onClick={() =>
                        set(
                          "depends_on",
                          form.depends_on.filter((x) => x !== id),
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <select
            aria-label="Add a dependency"
            value={addDep}
            onChange={(e) => {
              if (e.target.value) set("depends_on", [...form.depends_on, e.target.value]);
              setAddDep("");
            }}
          >
            <option value="">Add a ticket this waits on…</option>
            {depChoices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title.replace(/\*\*/g, "")}
              </option>
            ))}
          </select>
        </div>

        <label className="f" htmlFor="fBlocked">
          Blocked because
          <input
            id="fBlocked"
            maxLength={300}
            placeholder="Leave empty if nothing is in the way"
            value={form.blocked_reason}
            onChange={(e) => set("blocked_reason", e.target.value)}
          />
        </label>

        <div className="f">
          Acceptance criteria
          {list.total > 0 && (
            <ul className="checks">
              {list.items.map((it) => (
                <li key={it.line}>
                  <label>
                    <input
                      type="checkbox"
                      checked={it.checked}
                      onChange={() => set("criteria", toggleLine(form.criteria, it.line))}
                    />
                    <span className={it.checked ? "done" : ""}>
                      <Rich text={it.text} />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <textarea
            id="fCriteria"
            maxLength={4000}
            placeholder={"- [ ] One line per check\n- [ ] Done means all of these are ticked"}
            value={form.criteria}
            onChange={(e) => set("criteria", e.target.value)}
          />
        </div>

        {showDecision && (
          <label className="f" htmlFor="fDecision">
            Decision
            <textarea
              id="fDecision"
              maxLength={2000}
              placeholder="The answer, and the reason. Fill this in before moving a question to Done."
              value={form.decision}
              onChange={(e) => set("decision", e.target.value)}
            />
          </label>
        )}

        <div className="row2">
          <label className="f" htmlFor="fDoc">
            Design doc
            <input
              id="fDoc"
              maxLength={500}
              placeholder="Link or path to the spec"
              value={form.design_doc}
              onChange={(e) => set("design_doc", e.target.value)}
            />
          </label>
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
        </div>

        <label className="f" htmlFor="fNotes">
          Notes
          <textarea
            id="fNotes"
            maxLength={4000}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>

        <p className="hint">Wrap keywords in **double asterisks** to bold them in titles.</p>

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
          {ticket && (
            <button type="button" className="btn" onClick={shareTicket} title="Copy a link that opens this ticket">
              {shared ? "Copied" : `Share #${ticket.number}`}
            </button>
          )}
          <button type="button" className="btn" onClick={copyLink} title="Copy a link that applies the changes you have made here">
            Copy change link
          </button>
          <span className="spacer" />
          {ticket && canDelete && (
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

        {ticket && detail?.events && detail.events.length > 0 && (
          <details className="history">
            <summary>History ({detail.events.length})</summary>
            <ul className="log">
              {detail.events.slice(0, 20).map((ev) => (
                <li key={ev.id}>
                  <time title={absolute(ev.at)}>{ago(ev.at)}</time>
                  <span>
                    <span className="by">{ev.actor}</span> {ev.text}
                    {canDelete && (
                      <button
                        type="button"
                        className="ev-del"
                        onClick={() => void removeEvent(ev.id)}
                        aria-label="Delete this history entry"
                      >
                        {armedEvent === ev.id ? "click again to delete" : "delete"}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </form>
    </dialog>
  );
}
