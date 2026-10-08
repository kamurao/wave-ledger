import type { Ticket } from "./types";

export class ApiError extends Error {
  status: number;
  ticket?: Ticket;
  constructor(status: number, message: string, ticket?: Ticket) {
    super(message);
    this.status = status;
    this.ticket = ticket;
  }
}

async function send(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* empty body is fine on some errors */
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof body.error === "string" ? body.error : `request failed (${res.status})`,
      body.ticket as Ticket | undefined,
    );
  }
  return body;
}

export const fetcher = (url: string) =>
  fetch(url, { headers: { accept: "application/json" } }).then((r) => {
    if (!r.ok) throw new ApiError(r.status, `request failed (${r.status})`);
    return r.json();
  });

export type TicketFields = {
  title: string;
  kind: string;
  status: string;
  assignee: string | null;
  epic_id: string | null;
  milestone_id: string | null;
  priority: string;
  estimate: string | null;
  labels: string[];
  depends_on: string[];
  blocked_reason: string;
  design_doc: string;
  criteria: string;
  decision: string;
  branch: string;
  notes: string;
};

/** What a PATCH may carry: any of the fields, plus where the card sits in its column. */
export type TicketPatch = Partial<TicketFields> & { rank?: number };

export function createTicket(fields: Partial<TicketFields> & { title: string }, by?: string) {
  return send("/api/tickets", { method: "POST", body: JSON.stringify({ ...fields, by }) });
}

export function patchTicket(id: string, patch: TicketPatch, version: number, by?: string) {
  return send(`/api/tickets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "if-match-version": String(version) },
    body: JSON.stringify({ ...patch, by }),
  });
}

export function deleteTicket(id: string) {
  return send(`/api/tickets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function deleteTicketEvent(ticketId: string, eventId: number) {
  return send(`/api/tickets/${encodeURIComponent(ticketId)}/events/${eventId}`, { method: "DELETE" });
}

export function editTicketEvent(ticketId: string, eventId: number, text: string) {
  return send(`/api/tickets/${encodeURIComponent(ticketId)}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

export type EpicFields = {
  name: string;
  summary: string;
  color: string;
  status: string;
  owner: string | null;
};

export function createEpic(fields: Partial<EpicFields> & { name: string }) {
  return send("/api/epics", { method: "POST", body: JSON.stringify(fields) });
}

export function patchEpic(id: string, patch: Partial<EpicFields>, version: number) {
  return send(`/api/epics/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "if-match-version": String(version) },
    body: JSON.stringify(patch),
  });
}

export function deleteEpic(id: string) {
  return send(`/api/epics/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type MilestoneFields = {
  name: string;
  goal: string;
  target_date: string | null;
  status: string;
};

export function createMilestone(fields: Partial<MilestoneFields> & { name: string }) {
  return send("/api/milestones", { method: "POST", body: JSON.stringify(fields) });
}

export function patchMilestone(id: string, patch: Partial<MilestoneFields>, version: number) {
  return send(`/api/milestones/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "if-match-version": String(version) },
    body: JSON.stringify(patch),
  });
}

export function deleteMilestone(id: string) {
  return send(`/api/milestones/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function applyLink(query: string) {
  return send("/api/apply", { method: "POST", body: JSON.stringify({ query }) });
}
