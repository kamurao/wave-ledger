"use client";

import { useEffect, useRef, useState } from "react";

export type LiveState = "connecting" | "live" | "polling";

/**
 * Subscribes to /api/stream and calls `onChange` when the board moves.
 *
 * Vercel caps how long a function may stream, so the server closes the stream
 * every ~50s and EventSource reconnects on its own. After three failed attempts
 * we stop trying and report "polling"; the caller then leans on SWR's interval,
 * which is the documented v1 fallback.
 */
export function useRealtime(onChange: () => void): LiveState {
  const [state, setState] = useState<LiveState>("connecting");
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setState("polling");
      return;
    }

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      es = new EventSource("/api/stream");

      es.addEventListener("hello", () => {
        failures = 0;
        setState("live");
      });
      es.addEventListener("change", () => cb.current());
      es.addEventListener("error", () => {
        // A clean end-of-lifetime close also lands here; only a CLOSED socket
        // means EventSource has given up and needs a fresh one.
        if (!es || es.readyState !== EventSource.CLOSED) {
          setState("connecting");
          return;
        }
        es.close();
        es = null;
        failures += 1;
        if (failures >= 3) {
          setState("polling");
          return;
        }
        setState("connecting");
        retryTimer = setTimeout(connect, 1500 * failures);
      });
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      es?.close();
    };
  }, []);

  return state;
}

/** Re-renders on a timer so the "3h ago" stamps stay honest. */
export function useMinuteTick(paused: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [paused]);
  return now;
}
