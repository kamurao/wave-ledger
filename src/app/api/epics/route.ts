import { apiError, json, readJson, requireWriter, route } from "@/lib/api";
import { createEpic, listEpics } from "@/lib/containers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function GETHandler() {
  return json({ epics: await listEpics() });
}

async function POSTHandler(req: Request) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const body = await readJson(req);
  if (!body) return apiError(400, "expected a JSON object body");

  const result = await createEpic(body);
  if (!result.ok) return apiError(result.code === "conflict" ? 409 : 400, result.message);
  return json({ epic: result.item }, { status: 201 });
}

export const GET = route(GETHandler);
export const POST = route(POSTHandler);
