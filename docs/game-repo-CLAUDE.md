# The board section for the game repo's CLAUDE.md

The GamePlanning repo's `CLAUDE.md` already points sessions at the Wave Ledger board. This is the
text for that section as of the game-design redesign: it adds epics, milestones, priority and the
Review stage, and it makes a closed question carry its decision.

**Nothing here is urgent.** The old three-status contract (`todo` → `in_progress` → `done`, kinds
`feature` and `question`, no epic or priority) still works unchanged, so sessions following the
current game-repo instructions keep behaving. Adopt this when you want them to file work properly.

Substitute the real host if it ever moves.

---

```markdown
## Wave Ledger (the board)

Board: https://wave-ledger.vercel.app. One read gets everything: GET /api/board
(tickets, epics, milestones). GET /api/meta lists the legal value of every field.

Before starting work: GET /api/board, match the prompt to a ticket by title/keywords.
  backlog | todo -> PATCH to in_progress with assignee + branch (If-Match-Version: its version)
  not found      -> POST a new one: id "t-<slug>", status in_progress, and set kind, epic_id,
                    milestone_id and priority (pick the epic that fits from /api/board)
  in_progress    -> leave it; refresh branch if it changed
When the work is committed: PATCH status to review if it needs a playtest or a sign-off.
Ask the person before moving anything to done.

Auth: Authorization: Bearer $WAVE_LEDGER_TOKEN

Rules:
- Ticket ids are slugs: "t-fast-forward", "t-act-progression".
- kind: feature, design, question, bug, task, art or audio.
- A question is only done once its "decision" field says what was decided and why.
- Questions and discussion do not create tickets unless the person asks for one.
- Handles: kamurao (Ken), Romaium, sunnyisabot123.
- Always send If-Match-Version with the version you just read. A 409 means someone else
  wrote first: re-read the ticket and redo your change on top of theirs.
- Do not send history or updated_at. The server writes both.
- Deleting is off on the open board. Move a ticket to done, or set an epic to archived.
```

---

## What changed from the previous instructions

**New:** `GET /api/board` as the one read; `review` as a stage between In progress and Done; `epic_id`,
`milestone_id`, `priority`, `estimate`, `labels`, `depends_on`, `blocked_reason`, `criteria` and
`decision` on tickets; the `design`, `bug`, `task`, `art` and `audio` kinds.

**Also new:** every ticket has a permanent number (`#12`). Say "#12" in conversation and in commit
messages; `GET /api/tickets/12` works wherever a slug does; share a ticket as
https://wave-ledger.vercel.app/t/12.

**Gone:** the `section` field (KEN / FRANCO / SHAUN / Unsorted). Sending it is harmless, it is ignored.
Epics replace it, and they say what a ticket is *about* rather than whose list it came from.

**Kept:** the `t-<slug>` ids, "questions don't get tickets", the handle list, optimistic
concurrency through `If-Match-Version`, and server-side history.

## Storing the token

The token is a secret; it does not belong in `CLAUDE.md`. Put it in the environment the session
runs in — a `.env` the shell sources, or the machine's user environment — as `WAVE_LEDGER_TOKEN`.

## The writes, in full

```bash
# 1. claim an existing ticket
curl -X PATCH https://wave-ledger.vercel.app/api/tickets/t-tower-roles \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "If-Match-Version: 3" \
  -d '{"status":"in_progress","assignee":"kamurao","branch":"design/tower-roles"}'

# 2. open one that does not exist yet
curl -X POST https://wave-ledger.vercel.app/api/tickets \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"t-frost-tower","title":"Frost tower rework","kind":"feature",
       "status":"in_progress","assignee":"kamurao","branch":"feature/frost",
       "epic_id":"e-towers","milestone_id":"m-prototype","priority":"p1","estimate":"M"}'

# 3. hand it over for a playtest
curl -X PATCH https://wave-ledger.vercel.app/api/tickets/t-frost-tower \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "If-Match-Version: 4" \
  -d '{"status":"review"}'

# 4. close a question with its answer
curl -X PATCH https://wave-ledger.vercel.app/api/tickets/t-want-a-hero \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "If-Match-Version: 2" \
  -d '{"status":"done","decision":"Yes. The Hero is the player presence on the field."}'
```

A note worth adding when the status does not change — say the work is blocked:

```bash
curl -X POST https://wave-ledger.vercel.app/api/tickets/t-frost-tower/events \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"blocked on the tower art pass"}'
```

Or set `blocked_reason` on the ticket itself, so the board marks it.
