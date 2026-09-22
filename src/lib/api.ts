import { NextResponse } from "next/server";
import { resolveActor, type Actor } from "./authz";

export function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function apiError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return json({ error, ...extra }, { status });
}

/**
 * One gate for both doors: a session cookie for people, a bearer token for
 * agents. Returns the actor, or the response to send back instead.
 */
export async function requireWriter(
  req: Request,
): Promise<{ actor: Actor } | { response: NextResponse }> {
  const actor = await resolveActor(req);
  if (actor.canWrite) return { actor };
  if (actor.kind === "anon") {
    return {
      response: apiError(401, "sign in with GitHub, or send an agent token, to write to this board"),
    };
  }
  return {
    response: apiError(
      403,
      `@${actor.kind === "user" ? actor.login : "unknown"} is not on the writer allowlist`,
    ),
  };
}

/**
 * The version a caller is pinning its write to.
 *
 * Read from the `If-Match-Version` header, or `if_version` in the body, in that
 * order.
 *
 * The standard `If-Match` header is still honoured last, but it is deliberately
 * not the documented mechanism. A CDN or framework is entitled to evaluate
 * `If-Match` against the response ETag itself and answer 412 — and on Vercel it
 * does so *after* the row has been written, so the caller sees a failure for a
 * change that actually landed and a retry double-applies it. A private header
 * nothing else lays claim to cannot be intercepted that way.
 */
export function parseIfMatch(req: Request, body?: Record<string, unknown> | null): number | null {
  const candidates = [
    req.headers.get("if-match-version"),
    body?.if_version === undefined || body.if_version === null ? null : String(body.if_version),
    req.headers.get("if-match"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const n = Number(raw.replace(/^W\//, "").replace(/"/g, "").trim());
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Pulls only the known settable fields out of an arbitrary request body. */
export function pickPatch(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ["title", "kind", "status", "section", "branch", "notes"]) {
    if (body[k] !== undefined) out[k] = body[k] === null ? "" : String(body[k]);
  }
  if (body.assignee !== undefined) {
    out.assignee = body.assignee === null || body.assignee === "" ? null : String(body.assignee);
  }
  return out;
}

/**
 * Wraps a route handler so an unconfigured or unreachable database answers with
 * a plain 503 instead of an opaque 500. Agents read these messages, so they are
 * worth making legible.
 */
export function route<A extends unknown[]>(
  fn: (req: Request, ...rest: A) => Promise<Response>,
): (req: Request, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    try {
      return await fn(req, ...rest);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/DATABASE_URL|ECONNREFUSED|ENOTFOUND|relation .* does not exist/i.test(message)) {
        return apiError(503, "the board's database is not set up yet", { detail: message });
      }
      console.error("[wave-ledger]", message);
      return apiError(500, "unexpected server error");
    }
  };
}
