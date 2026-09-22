"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { DEFAULT_HANDLE, PEOPLE, type Status } from "@/lib/constants";
import { ApiError, fetcher, patchTicket } from "@/lib/client";
import type { ActivityRow, Ticket, Viewer } from "@/lib/types";
import type { LinkPlan } from "@/lib/link";
import { ActivityTab } from "./ActivityTab";
import { ApplyPanel } from "./ApplyPanel";
import { BoardTab } from "./BoardTab";
import { BulkDialog } from "./BulkDialog";
import { TicketDialog } from "./TicketDialog";
import { useMinuteTick, useRealtime } from "./useRealtime";
import { WorkflowTab } from "./WorkflowTab";

const TABS = [
  { id: "board", label: "Board" },
  { id: "activity", label: "Activity" },
  { id: "workflow", label: "Workflow" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ME_KEY = "wl-me";

export function App({
  initialTickets,
  initialActivity,
  viewer,
  plan,
  origin,
  auth,
}: {
  initialTickets: Ticket[];
  initialActivity: { events: ActivityRow[]; nextCursor: number | null };
  viewer: Viewer;
  plan: LinkPlan;
  origin: string;
  auth: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("board");
  const [me, setMe] = useState<string>(viewer.handle ?? DEFAULT_HANDLE);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-viewer convenience, not shared state — and it can throw in a private
  // window, so every touch is wrapped.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ME_KEY);
      if (saved && PEOPLE.some((p) => p.id === saved)) setMe(saved);
    } catch {
      /* no storage, keep the default */
    }
  }, []);

  const chooseMe = (handle: string) => {
    setMe(handle);
    try {
      localStorage.setItem(ME_KEY, handle);
    } catch {
      /* ignore */
    }
  };

  // The stream is the primary signal; the interval is a safety net behind it,
  // and the documented fallback when the stream is unavailable. Going through a
  // ref lets the subscription be declared before the fetch it refreshes.
  const refreshRef = useRef<() => void>(() => {});
  const live = useRealtime(() => refreshRef.current());

  const { data, mutate, error: loadError } = useSWR<{ tickets: Ticket[] }>("/api/tickets", fetcher, {
    fallbackData: { tickets: initialTickets },
    keepPreviousData: true,
    refreshInterval: live === "live" ? 30_000 : 10_000,
  });

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);
  refreshRef.current = refresh;

  const tickets = data?.tickets ?? initialTickets;

  const dialogOpen = editorOpen || bulkOpen;
  const now = useMinuteTick(dialogOpen);

  const liveLabel =
    loadError != null
      ? "offline"
      : live === "connecting"
        ? "connecting"
        : live === "live"
          ? `live · ${tickets.length} tickets`
          : `polling · ${tickets.length} tickets`;

  async function move(t: Ticket, status: Status) {
    if (!viewer.canWrite) {
      setError("You need write access to move tickets. Open a card and copy a link instead.");
      return;
    }
    const patch: { status: Status; assignee?: string } = { status };
    // Moving something to In progress is a claim; To do and Complete are not.
    if (status === "in_progress" && !t.assignee) patch.assignee = me;

    const optimistic = {
      tickets: tickets.map((x) =>
        x.id === t.id
          ? { ...x, ...patch, updated_at: new Date().toISOString(), version: x.version + 1 }
          : x,
      ),
    };

    setError(null);
    try {
      await mutate(
        async () => {
          await patchTicket(t.id, patch, t.version, me);
          return fetcher("/api/tickets");
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false },
      );
    } catch (err) {
      const e = err as ApiError;
      setError(
        e.status === 409
          ? "Someone moved that ticket at the same time. The board has been refreshed."
          : e.message,
      );
      void mutate();
    }
  }

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Wave Ledger</h1>
          <p className="sub">GamePlanning tickets. Claude moves them as work starts and finishes.</p>
        </div>
        <div className="who">
          <span className={`live${live === "live" ? " on" : ""}`}>
            <i />
            <span>{liveLabel}</span>
          </span>
          {auth}
          <label htmlFor="me">Working as</label>
          <select id="me" value={me} onChange={(e) => chooseMe(e.target.value)}>
            {PEOPLE.map((p) => (
              <option key={p.id} value={p.id}>
                @{p.id}
              </option>
            ))}
          </select>
        </div>
      </header>

      {plan.kind !== "none" && (
        <ApplyPanel plan={plan} canWrite={viewer.canWrite} onApplied={refresh} />
      )}

      {error && <div className="banner">{error}</div>}

      {!viewer.canWrite && plan.kind === "none" && (
        <div className="banner">
          You are reading this board. Sign in with GitHub to edit it, or open a ticket and press
          Copy link to send a change to someone who can apply it.
        </div>
      )}

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "board" && (
        <BoardTab
          tickets={tickets}
          now={now}
          canWrite={viewer.canWrite}
          onOpen={(t) => {
            setEditing(t);
            setEditorOpen(true);
          }}
          onAdd={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
          onBulk={() => setBulkOpen(true)}
          onMove={move}
        />
      )}
      {tab === "activity" && <ActivityTab initial={initialActivity} now={now} />}
      {tab === "workflow" && <WorkflowTab origin={origin} />}

      <TicketDialog
        open={editorOpen}
        ticket={editing}
        canWrite={viewer.canWrite}
        me={me}
        onClose={() => setEditorOpen(false)}
        onChanged={refresh}
      />
      <BulkDialog
        open={bulkOpen}
        me={me}
        onClose={() => setBulkOpen(false)}
        onChanged={refresh}
      />
    </div>
  );
}
