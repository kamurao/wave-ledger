"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  checklist,
  insertItem,
  isPureChecklist,
  removeLine,
  setItemText,
  toggleLine,
} from "@/lib/board";

/**
 * Acceptance criteria as one editable checklist: tick, retype, add and remove
 * items in place, instead of a read-only list over a textarea of the same lines.
 *
 * Criteria holding anything other than `- [ ]` lines open as plain text, so the
 * list view never hides a line; "Edit as text" is always there for bulk edits.
 */
export function CriteriaEditor({
  value,
  onChange,
  resetKey,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Changes when the dialog opens another ticket, to pick the starting view again. */
  resetKey: string;
}) {
  // "auto" follows the text until someone picks a view, so the choice is right
  // even when the ticket's criteria arrive after this mounts.
  const [mode, setMode] = useState<"auto" | "list" | "text">("auto");
  const [draft, setDraft] = useState("");
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const list = useMemo(() => checklist(value), [value]);
  const asText = mode === "auto" ? !isPureChecklist(value) : mode === "text";

  useEffect(() => {
    setMode("auto");
    setDraft("");
  }, [resetKey]);

  useEffect(() => {
    if (focusLine === null) return;
    inputs.current.get(focusLine)?.focus();
    setFocusLine(null);
  }, [focusLine, value]);

  function addAfter(line: number, text = "") {
    const next = insertItem(value, line, text);
    onChange(next.criteria);
    return next.line;
  }

  function onItemKey(e: React.KeyboardEvent<HTMLInputElement>, line: number, raw: string, index: number) {
    if (e.key === "Enter") {
      // Inside the ticket form, Enter would otherwise save the whole ticket.
      e.preventDefault();
      setFocusLine(addAfter(line));
    } else if (e.key === "Backspace" && raw === "") {
      e.preventDefault();
      onChange(removeLine(value, line));
      const prev = list.items[index - 1];
      if (prev) setFocusLine(prev.line);
    }
  }

  function addDraft() {
    const text = draft.trim();
    if (!text) return;
    addAfter(-1, text);
    setDraft("");
  }

  return (
    <div className="f crit">
      <div className="crit-head">
        <span>Acceptance criteria</span>
        {list.total > 0 && (
          <span className="crit-count">
            {list.done}/{list.total}
          </span>
        )}
        <span className="spacer" />
        <button type="button" className="cmt-act" onClick={() => setMode(asText ? "list" : "text")}>
          {asText ? "Edit as list" : "Edit as text"}
        </button>
      </div>

      {asText ? (
        <textarea
          id="fCriteria"
          maxLength={4000}
          placeholder={"- [ ] One line per check\n- [ ] Done means all of these are ticked"}
          value={value}
          onChange={(e) => {
            // Typing here pins the text view, or finishing a "- [ ] " line would flip it away.
            setMode("text");
            onChange(e.target.value);
          }}
        />
      ) : (
        <>
          {list.total > 0 && (
            <ul className="checks edit">
              {list.items.map((it, i) => (
                <li key={it.line}>
                  <input
                    type="checkbox"
                    aria-label={`Done: ${it.text || "empty item"}`}
                    checked={it.checked}
                    onChange={() => onChange(toggleLine(value, it.line))}
                  />
                  <input
                    type="text"
                    className={it.checked ? "done" : ""}
                    aria-label="Criterion"
                    maxLength={300}
                    value={it.raw}
                    ref={(el) => {
                      if (el) inputs.current.set(it.line, el);
                      else inputs.current.delete(it.line);
                    }}
                    onChange={(e) => onChange(setItemText(value, it.line, e.target.value))}
                    onKeyDown={(e) => onItemKey(e, it.line, it.raw, i)}
                  />
                  <button
                    type="button"
                    className="crit-del"
                    aria-label={`Remove ${it.text || "empty item"}`}
                    onClick={() => onChange(removeLine(value, it.line))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            className="crit-add"
            aria-label="Add a criterion"
            placeholder={list.total ? "Add another check…" : "Add a check, e.g. Slows enemies in range"}
            maxLength={300}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            onBlur={addDraft}
          />
        </>
      )}
    </div>
  );
}
