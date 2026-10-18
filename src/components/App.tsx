"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import { DEFAULT_HANDLE, PEOPLE, type Status } from "@/lib/constants";
import { byRank, progressOf, rankBetween } from "@/lib/board";
import { ApiError, DELETED_KEY, fetcher, patchTicket, type TicketPatch } from "@/lib/client";
import type { ActivityRow, Board, Epic, Milestone, Ticket, Viewer } from "@/lib/types";
import type { LinkPlan } from "@/lib/link";
import { ActivityTab } from "./ActivityTab";
import { ApplyPanel } from "./ApplyPanel";
import { BoardTab, NO_FILTERS, type Filters } from "./BoardTab";
import { BulkDialog } from "./BulkDialog";
import { EpicDialog, MilestoneDialog } from "./ContainerDialogs";
import { DeletedList } from "./DeletedList";
import { EpicsTab } from "./EpicsTab";
import { RoadmapTab } from "./RoadmapTab";
import { TicketDialog, type NewTicketDefaults } from "./TicketDialog";
import { useMinuteTick, useRealtime } from "./useRealtime";
import { WorkflowTab } from "./WorkflowTab";

const TABS = [
  { id: "board", label: "Board" },
  { id: "epics", label: "Epics" },
  { id: "roadmap", label: "Roadmap" },
  { id: "activity", label: "Activity" },
  { id: "workflow", label: "Workflow" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ME_KEY = "wl-me";

export function App({
  initialBoard,
  initialActivity,
  viewer,
  plan,
  openRef,
  origin,
  auth,
}: {
  initialBoard: Board;
  initialActivity: { events: ActivityRow[]; nextCursor: number | null };
  viewer: Viewer;
  plan: LinkPlan;
  /** A ticket number or id from `?ticket=`, opened on load so links to a ticket work. */
  openRef: string | null;
  origin: string;
  auth: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("board");
  const [me, setMe] = useState<string>(viewer.handle ?? DEFAULT_HANDLE);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const [editing, setEditing] = useState<Ticket | null>(null);
  const [defaults, setDefaults] = useState<NewTicketDefaults | undefined>(undefined);
  const [editorOpen, setEditorOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [epicEditing, setEpicEditing] = useState<Epic | null>(null);
  const [epicOpen, setEpicOpen] = useState(false);
  const [msEditing, setMsEditing] = useState<Milestone | null>(null);
  const [msOpen, setMsOpen] = useState(false);
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

  const { data, mutate, error: loadError } = useSWR<Board>("/api/board", fetcher, {
    fallbackData: initialBoard,
    keepPreviousData: true,
    refreshInterval: live === "live" ? 30_000 : 10_000,
  });

  const { mutate: mutateKey } = useSWRConfig();
  const refresh = useCallback(() => {
    void mutate();
    void mutateKey(DELETED_KEY);
  }, [mutate, mutateKey]);
  refreshRef.current = refresh;

  const tickets = data?.tickets ?? initialBoard.tickets;
  const epics = data?.epics ?? initialBoard.epics;
  const milestones = data?.milestones ?? initialBoard.milestones;

  const dialogOpen = editorOpen || bulkOpen || epicOpen || msOpen;
  const now = useMinuteTick(dialogOpen);

  const byId = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const pulse = useMemo(() => {
    const p = progressOf(tickets, byId);
    const active = milestones.find((m) => m.status === "active");
    const ap = active ? progressOf(tickets.filter((t) => t.milestone_id === active.id), byId) : null;
    return { p, active, ap };
  }, [tickets, milestones, byId]);

  const liveLabel =
    loadError != null
      ? "offline"
      : live === "connecting"
        ? "connecting"
        : live === "live"
          ? `live · ${tickets.length} tickets`
          : `polling · ${tickets.length} tickets`;

  /**
   * Moves a card to a column and a position in it, in one PATCH: the new stage,
   * the new rank, and — when swimlanes are on and it crossed lanes — the new epic.
   */
  async function place(t: Ticket, status: Status, beforeId: string | null, epicId: string | null | undefined) {
    if (!viewer.canWrite) {
      setError("You need write access to move tickets. Open a card and copy a link instead.");
      return;
    }

    const column = tickets.filter((x) => x.status === status).sort(byRank);
    const others = column.filter((x) => x.id !== t.id);
    const at = beforeId ? others.findIndex((x) => x.id === beforeId) : -1;
    const next = at >= 0 ? others[at] : undefined;
    const prev = at >= 0 ? others[at - 1] : others[others.length - 1];

    // Same column and same neighbours means the drop changed nothing.
    const oldIdx = column.findIndex((x) => x.id === t.id);
    const unchanged =
      status === t.status &&
      oldIdx >= 0 &&
      column[oldIdx - 1]?.id === prev?.id &&
      column[oldIdx + 1]?.id === next?.id;

    const patch: TicketPatch = {};
    if (!unchanged) patch.rank = rankBetween(prev?.rank, next?.rank);
    if (status !== t.status) patch.status = status;
    // Moving something to In progress is a claim; the other columns are not.
    if (status === "in_progress" && !t.assignee) patch.assignee = me;
    if (epicId !== undefined && (epicId ?? null) !== t.epic_id) patch.epic_id = epicId;
    if (Object.keys(patch).length === 0) return;

    const optimistic: Board = {
      epics,
      milestones,
      tickets: tickets.map((x) =>
        x.id === t.id
          ? { ...x, ...(patch as Partial<Ticket>), updated_at: new Date().toISOString(), version: x.version + 1 }
          : x,
      ),
    };

    setError(null);
    try {
      await mutate(
        async () => {
          await patchTicket(t.id, patch, t.version, me);
          return fetcher("/api/board");
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

  // Keep the address bar pointing at the open ticket, so copying it shares it.
  const setUrlTicket = (n: number | null) => {
    try {
      window.history.replaceState(null, "", n ? `/?ticket=${n}` : "/");
    } catch {
      /* the URL is a convenience */
    }
  };

  const openTicket = (t: Ticket) => {
    setEditing(t);
    setDefaults(undefined);
    setEditorOpen(true);
    setUrlTicket(t.number);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setUrlTicket(null);
  };

  // A link like /t/12 lands here with ?ticket=12: open it once, if it exists.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current || !openRef) return;
    openedRef.current = true;
    const want = openRef.replace(/^#/, "");
    const hit =
      tickets.find((t) => t.id === openRef) ?? tickets.find((t) => String(t.number) === want);
    if (hit) openTicket(hit);
    else {
      // Not on the board: it may be in the Deleted list, which the board does not load.
      fetcher(`/api/tickets/${encodeURIComponent(openRef)}`)
        .then((d: { ticket: Ticket }) => openTicket(d.ticket))
        .catch(() => setError(`There is no ticket "${openRef}" on this board.`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTicket = (status: Status, epicId: string | null) => {
    setEditing(null);
    setDefaults({ status, epic_id: epicId });
    setEditorOpen(true);
  };

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Wave Ledger</h1>
          <p className="sub">Slay the Tower design board. Claude moves tickets as work starts and finishes.</p>
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

      {plan.kind !== "none" && <ApplyPanel plan={plan} canWrite={viewer.canWrite} onApplied={refresh} />}

      {error && <div className="banner">{error}</div>}

      {!viewer.canWrite && plan.kind === "none" && (
        <div className="banner">
          You are reading this board.{" "}
          {viewer.signInAvailable ? "Sign in with GitHub to edit it, or open" : "Open"} a ticket and press Copy
          link to send a change to someone who can apply it.
        </div>
      )}

      <div className="pulse" aria-label="Board summary">
        {pulse.active && pulse.ap && (
          <button
            className="pulse-main"
            onClick={() => setTab("roadmap")}
            title="Open the roadmap"
          >
            <span className="k">Now</span>
            <b>{pulse.active.name}</b>
            <span className="mini">
              <i style={{ width: `${pulse.ap.pct}%` }} />
            </span>
            <span className="v">
              {pulse.ap.done}/{pulse.ap.total}
            </span>
          </button>
        )}
        <button
          className="pulse-chip"
          onClick={() => {
            setFilters({ ...NO_FILTERS, kind: "question" });
            setTab("board");
          }}
        >
          <span className="k">Open questions</span>
          <b>{pulse.p.openQuestions}</b>
        </button>
        <button
          className="pulse-chip"
          onClick={() => {
            setFilters({ ...NO_FILTERS, blockedOnly: true });
            setTab("board");
          }}
        >
          <span className="k">Blocked</span>
          <b className={pulse.p.hardBlocked ? "bad" : pulse.p.blocked ? "wait" : ""}>{pulse.p.blocked}</b>
        </button>
        <span className="pulse-chip static">
          <span className="k">In progress</span>
          <b>{pulse.p.in_progress}</b>
        </span>
        <span className="pulse-chip static">
          <span className="k">In review</span>
          <b>{pulse.p.review}</b>
        </span>
        <span className="pulse-chip static">
          <span className="k">Done</span>
          <b>
            {pulse.p.done}
            <small>/{pulse.p.total}</small>
          </b>
        </span>
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "board" && (
        <BoardTab
          tickets={tickets}
          epics={epics}
          milestones={milestones}
          filters={filters}
          setFilters={setFilters}
          now={now}
          canWrite={viewer.canWrite}
          onOpen={openTicket}
          onAdd={addTicket}
          onBulk={() => setBulkOpen(true)}
          onPlace={place}
        />
      )}
      {tab === "board" && <DeletedList now={now} onOpen={openTicket} />}
      {tab === "epics" && (
        <EpicsTab
          epics={epics}
          tickets={tickets}
          canWrite={viewer.canWrite}
          onNew={() => {
            setEpicEditing(null);
            setEpicOpen(true);
          }}
          onEdit={(e) => {
            setEpicEditing(e);
            setEpicOpen(true);
          }}
          onView={(epicId) => {
            setFilters({ ...NO_FILTERS, epic: epicId });
            setTab("board");
          }}
        />
      )}
      {tab === "roadmap" && (
        <RoadmapTab
          milestones={milestones}
          epics={epics}
          tickets={tickets}
          now={now}
          canWrite={viewer.canWrite}
          onNewMilestone={() => {
            setMsEditing(null);
            setMsOpen(true);
          }}
          onEditMilestone={(m) => {
            setMsEditing(m);
            setMsOpen(true);
          }}
          onOpen={openTicket}
        />
      )}
      {tab === "activity" && <ActivityTab initial={initialActivity} now={now} />}
      {tab === "workflow" && <WorkflowTab origin={origin} epics={epics} milestones={milestones} />}

      <TicketDialog
        open={editorOpen}
        ticket={editing}
        defaults={defaults}
        tickets={tickets}
        epics={epics}
        milestones={milestones}
        canWrite={viewer.canWrite}
        canDelete={viewer.canDelete}
        me={me}
        onClose={closeEditor}
        onChanged={refresh}
      />
      <BulkDialog
        open={bulkOpen}
        me={me}
        epics={epics}
        milestones={milestones}
        onClose={() => setBulkOpen(false)}
        onChanged={refresh}
      />
      <EpicDialog
        open={epicOpen}
        epic={epicEditing}
        canWrite={viewer.canWrite}
        canDelete={viewer.canDelete}
        onClose={() => setEpicOpen(false)}
        onChanged={refresh}
      />
      <MilestoneDialog
        open={msOpen}
        milestone={msEditing}
        canWrite={viewer.canWrite}
        canDelete={viewer.canDelete}
        onClose={() => setMsOpen(false)}
        onChanged={refresh}
      />
    </div>
  );
}
