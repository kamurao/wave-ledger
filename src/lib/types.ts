import type { Kind, Section, Status } from "./constants";

export type Ticket = {
  id: string;
  title: string;
  kind: Kind;
  status: Status;
  assignee: string | null;
  section: Section;
  branch: string;
  notes: string;
  created_at: string;
  updated_at: string;
  version: number;
};

export type TicketEvent = {
  id: number;
  ticket_id: string;
  at: string;
  actor: string;
  text: string;
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
  /** Deleting needs a verified identity, so an open-board visitor cannot. */
  canDelete: boolean;
  /** True when the board lets anyone with the link write. */
  openBoard: boolean;
  /** False when no GitHub OAuth app is configured, so sign-in is hidden. */
  signInAvailable: boolean;
};
