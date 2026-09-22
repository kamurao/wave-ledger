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
  section: string;
  branch: string;
  notes: string;
};

export function createTicket(fields: Partial<TicketFields> & { title: string }, by?: string) {
  return send("/api/tickets", { method: "POST", body: JSON.stringify({ ...fields, by }) });
}

export function patchTicket(
  id: string,
  patch: Partial<TicketFields>,
  version: number,
  by?: string,
) {
  return send(`/api/tickets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "if-match-version": String(version) },
    body: JSON.stringify({ ...patch, by }),
  });
}

export function deleteTicket(id: string) {
  return send(`/api/tickets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function applyLink(query: string) {
  return send("/api/apply", { method: "POST", body: JSON.stringify({ query }) });
}
