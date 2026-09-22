"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client";
import { ago, absolute } from "@/lib/time";
import type { ActivityRow } from "@/lib/types";
import { Rich } from "./ui";

type Page = { events: ActivityRow[]; nextCursor: number | null };

const PAGE = 100;

/**
 * Every ticket's history in one reverse-chronological list.
 *
 * The history array the artifact kept on each ticket was capped at 40 entries;
 * with its own table there is no cap, so this pages instead of truncating.
 */
export function ActivityTab({ initial, now }: { initial: Page; now: number }) {
  const { data } = useSWR<Page>(`/api/events?limit=${PAGE}`, fetcher, {
    fallbackData: initial,
    refreshInterval: 30_000,
  });
  const [older, setOlder] = useState<ActivityRow[]>([]);
  const [cursor, setCursor] = useState<number | null>(initial.nextCursor);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const byId = new Map<number, ActivityRow>();
    for (const r of [...(data?.events ?? []), ...older]) byId.set(r.id, r);
    return [...byId.values()].sort((a, b) => b.id - a.id);
  }, [data, older]);

  const effectiveCursor = cursor ?? data?.nextCursor ?? null;

  async function loadMore() {
    if (busy) return;
    const before = rows.length ? rows[rows.length - 1].id : effectiveCursor;
    if (!before) return;
    setBusy(true);
    try {
      const page: Page = await fetcher(`/api/events?limit=${PAGE}&before=${before}`);
      setOlder((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="panel">
        <ul className="log">
          {rows.length ? (
            rows.map((r) => (
              <li key={r.id}>
                <time title={absolute(r.at)}>{ago(r.at, now)}</time>
                <span>
                  <span className="by">{r.actor}</span> {r.text}: <Rich text={r.title} />
                </span>
              </li>
            ))
          ) : (
            <li>
              <span className="empty">No activity yet.</span>
            </li>
          )}
        </ul>
        {effectiveCursor && (
          <div className="more">
            <button className="btn sm" onClick={loadMore} disabled={busy}>
              {busy ? "Loading…" : "Load older activity"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
