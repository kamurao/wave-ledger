"use client";

import useSWR from "swr";
import { DELETED_KEY, fetcher } from "@/lib/client";
import { ago, absolute } from "@/lib/time";
import type { Ticket } from "@/lib/types";
import { Rich } from "./ui";

/**
 * The Deleted list under the board: where a deleted ticket goes, and where it is
 * restored from. Hidden while it is empty, collapsed otherwise.
 */
export function DeletedList({ now, onOpen }: { now: number; onOpen: (t: Ticket) => void }) {
  const { data } = useSWR<{ tickets: Ticket[] }>(DELETED_KEY, fetcher, { refreshInterval: 60_000 });
  const list = [...(data?.tickets ?? [])].sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
  if (list.length === 0) return null;

  return (
    <details className="history deleted-list">
      <summary>Deleted ({list.length})</summary>
      <ul className="log">
        {list.map((t) => (
          <li key={t.id}>
            <time title={t.deleted_at ? absolute(t.deleted_at) : undefined}>
              {t.deleted_at ? ago(t.deleted_at, now) : ""}
            </time>
            <span>
              <button type="button" className="linkish" onClick={() => onOpen(t)}>
                <b className="num">#{t.number}</b> <Rich text={t.title} />
              </button>{" "}
              <span className="by">by {t.deleted_by ?? "someone"}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
