"use client";

import { useEffect, useRef, useState } from "react";
import { SECTIONS } from "@/lib/constants";
import { createTicket, type ApiError } from "@/lib/client";

/**
 * Bulk create, one ticket per line. A line ending in `?` becomes a question,
 * everything else a feature; all land in To do. This is how the original team
 * list was imported, and it is still the fastest way to dump a meeting's output
 * onto the board.
 */
export function BulkDialog({
  open,
  me,
  onClose,
  onChanged,
}: {
  open: boolean;
  me: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [section, setSection] = useState("Unsorted");
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
            kind: /\?$/.test(line) ? "question" : "feature",
            status: "todo",
            section,
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
          One ticket per line. Lines ending in a question mark become questions; everything else
          becomes a feature. New tickets land in To do.
        </p>
        <label className="f" htmlFor="bulkText">
          Tickets
          <textarea
            id="bulkText"
            style={{ minHeight: 180 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="f" htmlFor="bulkSection">
          List
          <select id="bulkSection" value={section} onChange={(e) => setSection(e.target.value)}>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
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
