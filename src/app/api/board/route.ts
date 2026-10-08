import { META, getBoard } from "@/lib/containers";
import { json, route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything in one read: tickets, epics, milestones, and the legal values. */
async function GETHandler() {
  return json({ ...(await getBoard()), meta: META });
}

export const GET = route(GETHandler);
