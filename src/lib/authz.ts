import { timingSafeEqual } from "node:crypto";
import { auth } from "./auth";
import { canonicalHandle } from "./constants";
import type { Viewer } from "./types";

/**
 * Who is making this request, and may they write?
 *
 * Two doors, one check: a session cookie for people, a bearer token for agents.
 * Everyone else reads.
 */
export type Actor =
  | { kind: "anon"; canWrite: false; handle: null; label: "anonymous" }
  | { kind: "user"; canWrite: boolean; handle: string | null; label: string; login: string }
  | { kind: "agent"; canWrite: true; handle: null; label: "claude" };

function writerLogins(): string[] {
  return (process.env.WRITER_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isWriterLogin(login: string | null | undefined): boolean {
  if (!login) return false;
  const allow = writerLogins();
  // An empty allowlist means "nobody but agents", not "everybody" — failing
  // closed matters more here than convenience during setup.
  return allow.includes(login.toLowerCase());
}

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function agentTokens(): string[] {
  return (process.env.WAVE_LEDGER_TOKEN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function bearerIsValid(header: string | null): boolean {
  if (!header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  const presented = m[1].trim();
  const valid = agentTokens();
  if (valid.length === 0) return false;
  return valid.some((t) => tokensEqual(t, presented));
}

/** Resolves the actor behind an API request. */
export async function resolveActor(req: Request): Promise<Actor> {
  if (bearerIsValid(req.headers.get("authorization"))) {
    return { kind: "agent", canWrite: true, handle: null, label: "claude" };
  }
  const session = await auth();
  const login = session?.user?.login ?? null;
  if (!login) return { kind: "anon", canWrite: false, handle: null, label: "anonymous" };
  return {
    kind: "user",
    canWrite: isWriterLogin(login),
    handle: canonicalHandle(login),
    label: "@" + login,
    login,
  };
}

/** The same question, for server components rendering the page. */
export async function resolveViewer(): Promise<Viewer> {
  const session = await auth();
  const login = session?.user?.login ?? null;
  return {
    login,
    name: session?.user?.name ?? null,
    image: session?.user?.image ?? null,
    handle: canonicalHandle(login),
    canWrite: isWriterLogin(login),
  };
}

/**
 * The actor string written into `ticket_events.actor`.
 *
 * `by` lets a link credit someone other than whoever clicked Apply; when the two
 * differ we keep both, because the log is the only record of who moved what.
 */
export function actorLabel(actor: Actor, by?: string | null): string {
  const credited = canonicalHandle(by);
  if (!credited) return actor.label;
  if (actor.kind === "agent") return "@" + credited;
  if (actor.kind === "user" && actor.login.toLowerCase() === credited.toLowerCase()) {
    return "@" + credited;
  }
  return `@${credited} (via ${actor.label})`;
}
