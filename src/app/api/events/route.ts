import { json, route } from "@/lib/api";
import { listActivity } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Activity tab's feed: every ticket's history, newest first, paged. */
async function GETHandler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const limit = Number(sp.get("limit") ?? 100);
  const before = Number(sp.get("before") ?? 0);
  const { events, nextCursor } = await listActivity({
    limit: Number.isFinite(limit) ? limit : 100,
    before: Number.isInteger(before) && before > 0 ? before : undefined,
  });
  return json({ events, nextCursor });
}

export const GET = route(GETHandler);
