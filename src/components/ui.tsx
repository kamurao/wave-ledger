import { Fragment } from "react";
import { personFor } from "@/lib/constants";

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
