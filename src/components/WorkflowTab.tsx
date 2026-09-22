"use client";

import { useState } from "react";
import { PEOPLE } from "@/lib/constants";
import { WhoChip } from "./ui";

/**
 * The rules live next to the board, not only in the game repo's CLAUDE.md, so
 * the board explains itself to anyone — or anything — that opens it.
 */
export function WorkflowTab({ origin }: { origin: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const claudeMd = `Board: ${origin} — tickets are at ${origin}/api/tickets.
Before starting work: GET /api/tickets, match the prompt to a ticket by title/keywords.
  todo        -> PATCH it to in_progress with assignee + branch (If-Match its version)
  not found   -> POST a new one, id "t-<slug>", status in_progress
  in_progress -> leave it; refresh branch if it changed
When the work is committed: PATCH status to done.
Auth: Authorization: Bearer $WAVE_LEDGER_TOKEN`;

  const example = `# claim a ticket
curl -X PATCH ${origin}/api/tickets/t-fast-forward \\
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "If-Match: 3" \\
  -d '{"status":"in_progress","assignee":"kamurao","branch":"feature/ken-changes"}'

# open one that does not exist yet
curl -X POST ${origin}/api/tickets \\
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"t-frost-tower","title":"Frost tower rework","status":"in_progress",
       "assignee":"kamurao","branch":"feature/frost"}'

# finish it
curl -X PATCH ${origin}/api/tickets/t-frost-tower \\
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "If-Match: 4" -d '{"status":"done"}'`;

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
          <h2>How Claude keeps this board current</h2>
          <p>
            Every Claude session in the game repo reads <code>/api/tickets</code> before starting
            work, then follows these steps.
          </p>
          <ol>
            <li>Search the tickets for one that matches the prompt (title and keywords).</li>
            <li>
              If it sits in <span className="st todo">To do</span>, PATCH it to{" "}
              <span className="st in_progress">In progress</span> with the assignee and the current
              git branch, pinned with <code>If-Match</code> on the version it just read.
            </li>
            <li>
              If no ticket matches, POST a new one with id <code>t-&lt;slug&gt;</code>, straight
              into <span className="st in_progress">In progress</span>.
            </li>
            <li>
              If it is already in progress, leave it alone — just refresh the branch if it changed.
            </li>
            <li>
              When the work is committed, PATCH the status to <span className="st done">Complete</span>.
            </li>
            <li>Pure questions and discussion do not create tickets unless the person asks.</li>
          </ol>
          <p>
            History is written server-side on every mutation, so agents never hand-maintain a log or
            touch <code>updated_at</code>.
          </p>
        </div>

        <div>
          <h2>Ticket lifecycle</h2>
          <div className="flow">
            <span className="st todo">To do</span>
            <span className="arrow">→</span>
            <span className="st in_progress">In progress</span>
            <span className="arrow">→</span>
            <span className="st done">Complete</span>
          </div>
          <p>
            You can drag cards between columns yourself, or open a card to change any field. Manual
            moves are logged under the name chosen in &ldquo;Working as&rdquo;. Dropping an
            unassigned ticket into In progress claims it for you; the other two columns do not
            assign, because only In progress is a claim.
          </p>
        </div>

        <div>
          <h2>Ticket fields</h2>
          <ul>
            <li>
              <code>title</code> supports <code>**bold**</code> for keywords, like{" "}
              <strong>slow</strong> or <strong>burn</strong>. That is the only markup there is.
            </li>
            <li>
              <code>kind</code> is <code>feature</code> (something to build) or{" "}
              <code>question</code> (something to decide).
            </li>
            <li>
              <code>status</code> is <code>todo</code>, <code>in_progress</code> or{" "}
              <code>done</code>.
            </li>
            <li>
              <code>assignee</code> is a contributor handle. <code>branch</code> is the git branch
              the work lives on.
            </li>
            <li>
              <code>section</code> is the list a ticket came from (KEN, FRANCO, SHAUN or Unsorted).
            </li>
            <li>
              <code>version</code> increments on every write. Send it back as <code>If-Match</code>{" "}
              and a stale write gets a <code>409</code> instead of clobbering someone.
            </li>
          </ul>
        </div>

        <div>
          <h2>Who can write</h2>
          <p>
            Anyone with the link can read the board. Writing needs either a GitHub sign-in on the
            allowlist, or an agent token. If you cannot write, edit a ticket anyway and press{" "}
            <strong>Copy link</strong>: that composes a URL carrying your change, which anyone with
            write access can open and apply in one click. Composing needs no permission; applying
            does.
          </p>
          <div className="pre">
            <pre>{`${origin}/?add=Frost%20tower%20rework&kind=feature&section=KEN
${origin}/?t=fast-forward&status=done&by=Romaium
${origin}/?id=t-fast-forward&assignee=Romaium&branch=feature/ff`}</pre>
          </div>
          <p>
            Opening one of those never changes anything on its own — it shows the ticket and a
            field-by-field before/after and waits for a click. There is no delete verb, so a
            mistaken link is always recoverable.
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
