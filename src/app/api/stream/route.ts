import { changeToken } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POLL_MS = 2000;
const HEARTBEAT_MS = 15_000;
/** Below Vercel's function ceiling, so we close cleanly instead of being cut off. */
const LIFETIME_MS = 50_000;

/**
 * Server-sent events, one per change.
 *
 * Postgres LISTEN/NOTIFY would be tidier, but it needs a connection that
 * outlives a serverless invocation. Fingerprinting the board on a short server
 * -side interval gets the same effect over one connection per viewer, and the
 * client falls back to polling if this route is unavailable.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(beat);
        clearTimeout(life);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", finish);

      let last: string | null = null;
      try {
        last = await changeToken();
      } catch {
        send("event: error\ndata: {}\n\n");
        finish();
        return;
      }
      send(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ token: last })}\n\n`);

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const token = await changeToken();
          if (token !== last) {
            last = token;
            send(`event: change\ndata: ${JSON.stringify({ token })}\n\n`);
          }
        } catch {
          // A transient database blip should not kill the stream; the next tick
          // tries again, and the client reconnects if the whole route dies.
        }
      }, POLL_MS);

      const beat = setInterval(() => send(": keep-alive\n\n"), HEARTBEAT_MS);
      const life = setTimeout(() => {
        send("event: bye\ndata: {}\n\n");
        finish();
      }, LIFETIME_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
