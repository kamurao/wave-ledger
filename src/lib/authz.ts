import { timingSafeEqual } from "node:crypto";
import { auth } from "./auth";
import { canonicalHandle } from "./constants";
import type { Viewer } from "./types";

/**
 * Who is making this request, and may they write?
 *
 * Three doors, one check: a bearer token for agents, a session cookie for
 * people, and — when the board is running open — the link itself.
 */
export type Actor =
  | { kind: "anon"; canWrite: false; handle: null; label: "anonymous" }
  | { kind: "open"; canWrite: true; handle: null; label: "someone" }
  | { kind: "user"; canWrite: boolean; handle: string | null; label: string; login: string }
  | { kind: "agent"; canWrite: true; handle: null; label: "claude" };

/**
 * Open board: anyone with the link can write, no sign-in.
 *
 * This is the low-ceremony way to get what the move off the artifact was for —
 * everyone on the project able to write — without standing up an OAuth app.
 * Deleting stays off in this mode (see `canDelete`), so the worst a passer-by
 * can do is reversible.
 */
export function isOpenBoard(): boolean {
  const v = (process.env.OPEN_BOARD ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

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

/** Only signed-in writers and agents may delete; an open-board visitor may not. */
export function canDelete(actor: Actor): boolean {
  return actor.kind === "agent" || (actor.kind === "user" && actor.canWrite);
}

/** GitHub sign-in is only offered when an OAuth app is actually configured. */
export function githubConfigured(): boolean {
  return Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
}

async function sessionLogin(): Promise<string | null> {
  if (!githubConfigured()) return null;
  try {
    const session = await auth();
    return session?.user?.login ?? null;
  } catch {
    // A misconfigured or missing AUTH_SECRET means nobody is signed in; it is
    // not a reason to take the board down.
    return null;
  }
}

/** Resolves the actor behind an API request. */
export async function resolveActor(req: Request): Promise<Actor> {
  if (bearerIsValid(req.headers.get("authorization"))) {
    return { kind: "agent", canWrite: true, handle: null, label: "claude" };
  }

  const login = await sessionLogin();
  if (login) {
    return {
      kind: "user",
      canWrite: isOpenBoard() || isWriterLogin(login),
      handle: canonicalHandle(login),
      label: "@" + login,
      login,
    };
  }

  if (isOpenBoard()) {
    return { kind: "open", canWrite: true, handle: null, label: "someone" };
  }
  return { kind: "anon", canWrite: false, handle: null, label: "anonymous" };
}

/** The same question, for server components rendering the page. */
export async function resolveViewer(): Promise<Viewer> {
  const login = await sessionLogin();
  let name: string | null = null;
  let image: string | null = null;
  if (login) {
    try {
      const session = await auth();
      name = session?.user?.name ?? null;
      image = session?.user?.image ?? null;
    } catch {
      /* cosmetic only */
    }
  }
  const signedInWriter = Boolean(login) && isWriterLogin(login);
  return {
    login,
    name,
    image,
    handle: canonicalHandle(login),
    canWrite: isOpenBoard() || signedInWriter,
    canDelete: signedInWriter,
    openBoard: isOpenBoard(),
    signInAvailable: githubConfigured(),
  };
}

/**
 * The actor string written into `ticket_events.actor`.
 *
 * `by` lets a link credit someone other than whoever clicked Apply, and on an
 * open board it is the only signal of who did something — so it is kept, while
 * anything that contradicts a verified identity keeps both halves.
 */
export function actorLabel(actor: Actor, by?: string | null): string {
  const credited = canonicalHandle(by);
  if (!credited) return actor.label;
  if (actor.kind === "agent") return "@" + credited;
  if (actor.kind === "open") return "@" + credited;
  if (actor.kind === "user" && actor.login.toLowerCase() === credited.toLowerCase()) {
    return "@" + credited;
  }
  return `@${credited} (via ${actor.label})`;
}
