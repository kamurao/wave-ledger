# Replacement for the game repo's board section

The GamePlanning repo's `CLAUDE.md` currently tells every session to use the `ArtifactData` tool
against `https://claude.ai/artifact/94k8jTUeUQsLoRRvjNrwGn`. **That artifact is no longer the
board.** Until this section is replaced, sessions will keep updating a board nobody reads.

Replace it with the text below. Substitute the real host once the app is deployed.

---

```markdown
## Wave Ledger (the board)

Board: https://<your-app>.vercel.app — tickets are at /api/tickets.

Before starting work: GET /api/tickets, match the prompt to a ticket by title/keywords.
  todo        -> PATCH it to in_progress with assignee + branch (If-Match its version)
  not found   -> POST a new one, id "t-<slug>", status in_progress
  in_progress -> leave it; refresh branch if it changed
When the work is committed: PATCH status to done.

Auth: Authorization: Bearer $WAVE_LEDGER_TOKEN

Rules:
- Ticket ids are slugs: "t-fast-forward", "t-act-progression".
- Questions and discussion do not create tickets unless the person asks for one.
- Handles: kamurao (Ken), Romaium, sunnyisabot123.
- Always send If-Match with the version you just read. A 409 means someone else
  wrote first: re-read the ticket and redo your change on top of theirs.
- Do not send history, updated_at or section. The server writes all three.
```

---

## What changed from the old instructions

**Keep:** the `t-<slug>` id convention, the "questions don't get tickets" rule, the handle list, and
the optimistic-concurrency requirement.

**Drop:** the manual `history` array resend, the `updated_at` bookkeeping, and the
`section: "Unsorted"` default. All three are server-side now, which removes most of the ceremony the
old instructions needed.

## Storing the token

The token is a secret; it does not belong in `CLAUDE.md`. Put it in the environment the session
runs in — a `.env` the shell sources, or the machine's user environment — as `WAVE_LEDGER_TOKEN`.

## The three writes, in full

```bash
# 1. claim an existing ticket
curl -X PATCH https://<your-app>.vercel.app/api/tickets/t-fast-forward \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "If-Match: 3" \
  -d '{"status":"in_progress","assignee":"kamurao","branch":"feature/ken-changes"}'

# 2. open one that does not exist yet
curl -X POST https://<your-app>.vercel.app/api/tickets \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"t-frost-tower","title":"Frost tower rework","status":"in_progress",
       "assignee":"kamurao","branch":"feature/frost"}'

# 3. finish it
curl -X PATCH https://<your-app>.vercel.app/api/tickets/t-frost-tower \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "If-Match: 4" \
  -d '{"status":"done"}'
```

A note worth adding when the status does not change — say the work is blocked:

```bash
curl -X POST https://<your-app>.vercel.app/api/tickets/t-frost-tower/events \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"blocked on the tower art pass"}'
```
