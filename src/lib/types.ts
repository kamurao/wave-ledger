import type {
  EpicStatus,
  Estimate,
  Kind,
  MilestoneStatus,
  Priority,
  Status,
} from "./constants";

export type Ticket = {
  id: string;
  /** Short permanent number, shown as #12 and usable in links. */
  number: number;
  title: string;
  kind: Kind;
  status: Status;
  assignee: string | null;
  epic_id: string | null;
  milestone_id: string | null;
  priority: Priority;
  estimate: Estimate | null;
  labels: string[];
  depends_on: string[];
  /** Non-empty means the ticket is blocked, and this says why. */
  blocked_reason: string;
  design_doc: string;
  /** `- [ ] item` / `- [x] item` lines. */
  criteria: string;
  /** The answer, once a question has been decided. */
  decision: string;
  branch: string;
  notes: string;
  /** Sort key within a column; lower is higher up. */
  rank: number;
  /** When it was deleted, or null while it is on the board. Restoring clears it. */
  deleted_at: string | null;
  /** Who deleted it, as the history credits them. */
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type Epic = {
  id: string;
  name: string;
  summary: string;
  color: string;
  status: EpicStatus;
  owner: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  version: number;
};

export type Milestone = {
  id: string;
  name: string;
  goal: string;
  target_date: string | null;
  status: MilestoneStatus;
  position: number;
  created_at: string;
  updated_at: string;
  version: number;
};

export type Board = {
  tickets: Ticket[];
  epics: Epic[];
  milestones: Milestone[];
};

export type TicketEvent = {
  id: number;
  ticket_id: string;
  at: string;
  actor: string;
  text: string;
};

export type TicketComment = {
  id: number;
  ticket_id: string;
  at: string;
  /** The same label history uses: `@kamurao`, `claude`, `someone`. */
  author: string;
  body: string;
  /** Set once the author has changed the text. */
  edited_at: string | null;
};

export type ActivityRow = TicketEvent & { title: string };

export type Viewer = {
  /** Signed-in GitHub login, or null when anonymous. */
  login: string | null;
  name: string | null;
  image: string | null;
  /** Canonical board handle this viewer acts as, when they map to one. */
  handle: string | null;
  canWrite: boolean;
  /** Purging and rewriting history need a verified identity, so an open-board visitor cannot. */
  canDelete: boolean;
  /** True when the board lets anyone with the link write. */
  openBoard: boolean;
  /** False when no GitHub OAuth app is configured, so sign-in is hidden. */
  signInAvailable: boolean;
};
