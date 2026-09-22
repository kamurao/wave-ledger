import { actorLabel } from "@/lib/authz";
import { apiError, json, readJson, requireWriter, route } from "@/lib/api";
import { type LinkField } from "@/lib/link";
import { planFromParams } from "@/lib/linkPlan";
import { createTicket, patchTicket, type Patch } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Applies an update-by-link.
 *
 * The plan is re-resolved from the query string here rather than trusted from
 * the client, so what gets written is what the server itself would have shown —
 * and a link that went stale between opening and clicking fails loudly.
 */
async function POSTHandler(req: Request) {
  const gate = await requireWriter(req);
  if ("response" in gate) return gate.response;

  const body = await readJson(req);
  const query = typeof body?.query === "string" ? body.query : "";
  if (!query) return apiError(400, "query is required");

  const sp = new URLSearchParams(query);
  const plan = await planFromParams(Object.fromEntries(sp.entries()));

  if (plan.kind === "none") return apiError(400, "that link does not change anything");
  if (plan.kind === "error") return apiError(400, plan.message);

  const actor = actorLabel(gate.actor, plan.by);

  if (plan.kind === "create") {
    const fields = Object.fromEntries(plan.fields.map((f) => [f.field, f.to])) as Partial<
      Record<LinkField, string>
    >;
    const result = await createTicket(
      { ...fields, title: plan.title, assignee: fields.assignee || null },
      actor,
    );
    if (!result.ok) return apiError(result.code === "conflict" ? 409 : 400, result.message);
    return json({ applied: "create", ticket: result.ticket }, { status: 201 });
  }

  const patch: Patch = {};
  for (const c of plan.changes) {
    if (c.field === "assignee") patch.assignee = c.to || null;
    else patch[c.field] = c.to;
  }

  const result = await patchTicket(plan.ticket.id, patch, {
    ifMatch: plan.ticket.version,
    actor,
  });

  if (result.ok) return json({ applied: "update", ticket: result.ticket });
  if (result.code === "not_found") return apiError(404, "that ticket no longer exists");
  if (result.code === "invalid") return apiError(400, result.message);
  return apiError(409, "someone changed that ticket while the link was open", {
    ticket: result.ticket,
  });
}

export const POST = route(POSTHandler);
