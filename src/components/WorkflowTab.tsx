"use client";

import { useState } from "react";
import { ESTIMATES, KINDS, PEOPLE, PRIORITIES, STATUSES } from "@/lib/constants";
import type { Epic, Milestone } from "@/lib/types";
import { EpicChip, StatusPill, WhoChip } from "./ui";

/**
 * The rules live next to the board, not only in the game repo's CLAUDE.md, so
 * the board explains itself to anyone — or anything — that opens it.
 */
export function WorkflowTab({
  origin,
  epics,
  milestones,
}: {
  origin: string;
  epics: Epic[];
  milestones: Milestone[];
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const claudeMd = `Board: ${origin}  (one read: GET ${origin}/api/board)
Auth: Authorization: Bearer $WAVE_LEDGER_TOKEN

Before starting work: GET /api/board, match the prompt to a ticket by title/keywords.
  todo | backlog -> PATCH to in_progress with assignee + branch
                    (If-Match-Version: the version you just read)
  not found      -> POST a new one, id "t-<slug>", status in_progress,
                    with epic_id, milestone_id, priority and kind set
  in_progress    -> leave it; refresh branch if it changed
When the work is committed: PATCH status to review (needs a playtest or sign-off)
  or to done (nothing left to check). Ask the person before using done.
A question is only done once "decision" says what was decided and why.
Valid values for every field: GET /api/meta`;

  const example = `# read everything: tickets, epics, milestones, and the legal values
curl ${origin}/api/board

# claim a ticket
curl -X PATCH ${origin}/api/tickets/t-tower-roles \\
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "If-Match-Version: 3" \\
  -d '{"status":"in_progress","assignee":"kamurao","branch":"design/tower-roles"}'

# open one that does not exist yet
curl -X POST ${origin}/api/tickets \\
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"t-frost-tower","title":"Frost tower rework","kind":"feature",
       "status":"in_progress","assignee":"kamurao","epic_id":"e-towers",
       "milestone_id":"m-prototype","priority":"p1","estimate":"M",
       "labels":["frost"],"depends_on":["t-tower-roles"]}'

# decide a question
curl -X PATCH ${origin}/api/tickets/t-want-a-hero \\
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "If-Match-Version: 2" \\
  -d '{"status":"done","decision":"Yes. The Hero is the player's presence on the field, and pillar 2."}'

# note something without changing anything
curl -X POST ${origin}/api/tickets/t-frost-tower/events \\
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"blocked on the tower art pass"}'

# epics and milestones
curl -X POST ${origin}/api/epics -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" -d '{"name":"Co-op","color":"e6","summary":"..."}'
curl -X PATCH ${origin}/api/milestones/m-concept -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" -d '{"status":"done"}'`;

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setCopied(null),
    );
  }

  return (
    <section>
      <div className="doc">
        <div>
          <h2>The flow</h2>
          <div className="flow">
            {STATUSES.map((s, i) => (
              <span key={s.id} style={{ display: "contents" }}>
                {i > 0 && <span className="arrow">→</span>}
                <StatusPill status={s.id} />
              </span>
            ))}
          </div>
          <ul>
            {STATUSES.map((s) => (
              <li key={s.id}>
                <strong>{s.label}.</strong> {s.hint}
              </li>
            ))}
          </ul>
          <p>
            Drag a card between columns, or up and down inside one: order in a column is priority, top
            first. Dropping an unassigned ticket into In progress claims it for you; no other column
            assigns, because only In progress is a claim.
          </p>
        </div>

        <div>
          <h2>When a ticket is ready, and when it is done</h2>
          <p>
            <strong>Ready</strong> means someone could pick it up without asking a question: it has an
            epic, a milestone and a priority; its acceptance criteria say what finished looks like;
            nothing it depends on is still open.
          </p>
          <p>
            <strong>Done</strong> depends on the type. A feature, design or art ticket is done when its
            acceptance criteria are all ticked. A <strong>question</strong> is done when its{" "}
            <code>decision</code> says what was decided and why, so the reasoning outlives the
            meeting that made it.
          </p>
          <p>
            Use <strong>Review</strong> for anything that needs eyes before it counts: a build to
            playtest, a spec to sign off. Pull it back to In progress if it fails.
          </p>
          <p>
            A ticket is <strong>blocked</strong> when it has a <code>blocked_reason</code>, or when
            anything in <code>depends_on</code> is not done. Blocked cards are marked on the board and
            counted in the summary strip.
          </p>
        </div>

        <div>
          <h2>How Claude keeps this board current</h2>
          <p>
            Every Claude session in the game repo reads <code>/api/board</code> before starting work,
            then follows these steps.
          </p>
          <ol>
            <li>Search the tickets for one that matches the prompt (title, notes and labels).</li>
            <li>
              If it sits in Backlog or Ready, PATCH it to <span className="st in_progress">In progress</span>{" "}
              with the assignee and the current git branch, pinned with <code>If-Match-Version</code> on
              the version it just read.
            </li>
            <li>
              If no ticket matches, POST a new one with id <code>t-&lt;slug&gt;</code>, straight into In
              progress, with its epic, milestone, priority and type filled in.
            </li>
            <li>If it is already in progress, leave it alone — just refresh the branch if it changed.</li>
            <li>
              When the work is committed, PATCH the status to Review, or to Done once the person
              confirms nothing is left to check.
            </li>
            <li>Pure questions and discussion do not create tickets unless the person asks.</li>
          </ol>
          <p>
            History is written server-side on every mutation, so agents never hand-maintain a log or
            touch <code>updated_at</code>. Reordering a column is the one change that does not log.
          </p>
        </div>

        <div>
          <h2>Ticket fields</h2>
          <ul>
            <li>
              <code>number</code> is the ticket&rsquo;s short permanent number, shown as <code>#12</code>. It
              is assigned by the board, never changes and is never reused. Anywhere an id is accepted, a number
              works too: <code>/api/tickets/12</code>. Share a ticket with <code>{origin}/t/12</code>.
            </li>
            <li>
              <code>title</code> supports <code>**bold**</code> for keywords, like <strong>slow</strong> or{" "}
              <strong>burn</strong>. That is the only markup there is.
            </li>
            <li>
              <code>kind</code>: {KINDS.map((k) => k.id).join(", ")}.
            </li>
            <li>
              <code>status</code>: {STATUSES.map((s) => s.id).join(", ")}.
            </li>
            <li>
              <code>priority</code>: {PRIORITIES.map((p) => `${p.id} ${p.name.toLowerCase()}`).join(", ")}.{" "}
              {PRIORITIES[0].hint}
            </li>
            <li>
              <code>estimate</code>: {ESTIMATES.join(", ")}, or null. T-shirt sizes, not hours.
            </li>
            <li>
              <code>epic_id</code> and <code>milestone_id</code> file it under a chunk of the game and a
              point in the plan.
            </li>
            <li>
              <code>labels</code> are free tags: lowercase, up to twelve. <code>depends_on</code> is a list of
              ticket ids.
            </li>
            <li>
              <code>criteria</code> is a checklist, one <code>- [ ] item</code> per line. The card shows
              how many are ticked.
            </li>
            <li>
              <code>decision</code> is the answer to a question. <code>design_doc</code> links the spec.
            </li>
            <li>
              <code>assignee</code> is a contributor handle; <code>branch</code> is the git branch the work
              lives on; <code>rank</code> is the order inside a column.
            </li>
            <li>
              <code>version</code> increments on every write. Send it back as <code>If-Match-Version</code>{" "}
              and a stale write gets a <code>409</code> instead of clobbering someone. Not the standard{" "}
              <code>If-Match</code>: a CDN can answer <code>412</code> for that one after the write has already
              landed.
            </li>
          </ul>
        </div>

        <div>
          <h2>Epics and milestones</h2>
          <p>
            An <strong>epic</strong> is a chunk of the game that tickets roll up into. A{" "}
            <strong>milestone</strong> is a point in the plan with a goal and, optionally, a date.
            Every ticket can have one of each; the Epics tab shows progress by chunk, the Roadmap by
            point in time.
          </p>
          <div className="people">
            {epics.map((e) => (
              <span key={e.id} title={e.id}>
                <EpicChip epic={e} />
              </span>
            ))}
          </div>
          <p className="hint">
            {milestones.map((m) => m.id).join(" · ")}
          </p>
        </div>

        <div>
          <h2>Who can write</h2>
          <p>
            This board is running <strong>open</strong>: anyone with the link can add, edit and move
            tickets, with no sign-in. Deleting a ticket moves it to the <strong>Deleted</strong> list under
            the board, where anyone can open it and press Restore; purging for good and deleting an epic
            stay with signed-in writers, so nothing anyone does here is unrecoverable. Agents still send a
            token, so their writes stay attributable.
          </p>
          <p>
            Set who you are in <strong>Working as</strong> before you start; that is the name the history
            records. If the board is ever switched to sign-in only, editing a ticket and pressing{" "}
            <strong>Copy link</strong> composes a URL carrying your change for someone with write access to
            apply. Composing needs no permission; applying does.
          </p>
          <div className="pre">
            <pre>{`${origin}/?add=Frost%20tower%20rework&kind=feature&epic=e-towers&priority=p1
${origin}/?t=tower-roles&status=review&by=Romaium
${origin}/?id=t-tower-roles&assignee=Romaium&branch=design/tower-roles`}</pre>
          </div>
          <p>
            Opening one of those never changes anything on its own — it shows the ticket and a
            field-by-field before/after and waits for a click.
          </p>
        </div>

        <div>
          <h2>Contributors</h2>
          <div className="people">
            {PEOPLE.map((p) => (
              <WhoChip key={p.id} handle={p.id} full />
            ))}
          </div>
        </div>

        <div>
          <h2>What the game repo&rsquo;s CLAUDE.md should say</h2>
          <div className="pre">
            <pre>{claudeMd}</pre>
          </div>
          <div className="actions">
            <button className="btn sm" onClick={() => copy("md", claudeMd)}>
              {copied === "md" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div>
          <h2>The exact writes an agent makes</h2>
          <div className="pre">
            <pre>{example}</pre>
          </div>
          <div className="actions">
            <button className="btn sm" onClick={() => copy("curl", example)}>
              {copied === "curl" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
