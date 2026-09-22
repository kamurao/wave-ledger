"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyLink, type ApiError } from "@/lib/client";
import { displayValue, type LinkPlan } from "@/lib/link";
import { Rich } from "./ui";

/**
 * Update-by-link, the confirmation half.
 *
 * Nothing here applies on its own. A link preview, a prefetch or a back-button
 * navigation renders this panel and stops; only the button writes.
 */
export function ApplyPanel({
  plan,
  canWrite,
  onApplied,
}: {
  plan: Exclude<LinkPlan, { kind: "none" }>;
  canWrite: boolean;
  onApplied: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = () => router.replace("/", { scroll: false });

  if (plan.kind === "error") {
    return (
      <div className="apply bad">
        <h2>That link does not work</h2>
        <p className="note err">{plan.message}</p>
        {plan.candidates && plan.candidates.length > 0 && (
          <ul className="matches">
            {plan.candidates.map((t) => (
              <li key={t.id}>
                <code>{t.id}</code>
                <span>
                  <Rich text={t.title} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="actions">
          <button className="btn" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Narrowed above; bound to a const so the narrowing survives into the closure.
  const active = plan;
  const changes = active.kind === "create" ? active.fields : active.changes;

  async function apply() {
    if (busy || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await applyLink(active.query);
      onApplied();
      router.replace("/", { scroll: false });
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <div className="apply">
      <h2>{plan.kind === "create" ? "This link adds a ticket" : "This link changes a ticket"}</h2>
      <p className="target">
        <Rich text={plan.kind === "create" ? plan.title : plan.ticket.title} />
        {plan.kind === "update" && (
          <>
            {" "}
            <code style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
              {plan.ticket.id}
            </code>
          </>
        )}
      </p>

      <div className="diff">
        {changes.map((c) => (
          <div key={c.field} style={{ display: "contents" }}>
            <span className="k">{c.field}</span>
            <span className="from">{displayValue(c.field, c.from)}</span>
            <span className="arrow">→</span>
            <span className="to">{displayValue(c.field, c.to)}</span>
          </div>
        ))}
      </div>

      {plan.by && <p className="note">Will be logged as @{plan.by}.</p>}
      {error && <p className="note err">{error}</p>}

      <div className="actions">
        <button className="btn primary" onClick={apply} disabled={!canWrite || busy}>
          {busy ? "Applying…" : plan.kind === "create" ? "Add this ticket" : "Apply this change"}
        </button>
        <button className="btn" onClick={dismiss} disabled={busy}>
          Dismiss
        </button>
      </div>

      {!canWrite && (
        <p className="note">
          You need write access to apply this. Sign in with GitHub, or send the link on to someone
          who can.
        </p>
      )}
    </div>
  );
}
