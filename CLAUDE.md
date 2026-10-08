# Working on Wave Ledger

This repo *is* the board. It is not the game repo — sessions here are changing the board's own code,
not moving its tickets. (If you are in the GamePlanning repo instead, see
[docs/game-repo-CLAUDE.md](docs/game-repo-CLAUDE.md).)

## Orientation

- `src/lib/tickets.ts` holds every read and write. The version check lives inside the `UPDATE`'s
  `WHERE` clause on purpose — do not lift it out into a read-then-write, or two agents racing on one
  ticket can both succeed.
- Optimistic concurrency travels as `If-Match-Version`, **not** the standard `If-Match`. Vercel
  evaluates `If-Match` against the response ETag and rewrites a successful 200 into a 412 *after*
  the row has been written, so the caller sees a failure for a change that actually landed.
  `generateEtags: false` in `next.config.ts` is the other half of that fix. Do not remove either
  without re-testing a successful pinned PATCH against a real deployment — it passes locally either
  way, which is exactly how this got shipped the first time.
- `src/lib/link.ts` must stay free of database imports. It is shared with the client, and pulling
  `tickets.ts` into it drags `pg` into the browser bundle. `linkPlan.ts` is the server-only half and
  is marked `server-only` to keep that honest.
- `src/lib/db.ts` connects on first query, not on import, because `next build` loads every route
  module to read its config.
- `src/app/globals.css` is lifted from the original artifact. The tokens, the Archivo + JetBrains
  Mono pairing and the component shapes are settled; new surfaces are built from the same tokens
  rather than restyled.

- `src/lib/tickets.ts` owns every field's validation in one place, `buildSet`, shared by create and
  patch. A new ticket field goes there, in `serializeTicket`, in `schema.ts`, in a new
  `drizzle/NNNN_*.sql` (additive and idempotent, so it is safe on the live database), and in
  `pickPatch` in `src/lib/api.ts`, which is the allowlist of keys a request body may set.
- Epics and milestones live in `src/lib/containers.ts` and have no event log on purpose. Their
  version and `updated_at` are enough for things that change this rarely.
- Run `npm run db:export` before anything that rewrites data. `db:seed -- --reset` wipes the lot.

- Ticket numbers (`tickets.number`, shown `#12`) come from the `tickets_number_seq` sequence and
  are never reused. `resolveTicketId` in `tickets.ts` turns a slug, `12` or `#12` into an id, and every
  `/api/tickets/:id` route calls it. The short share link is `/t/<ref>`, which redirects to `/?ticket=<ref>`.

## Things that look like bugs and are not

- **A PATCH that only changes `rank` writes no history and keeps `updated_at`.** It still bumps
  `version`. Dragging a card up a column is not news, and logging it would drown the Activity tab.
- **`todo` is labelled Ready.** The status ids `todo`, `in_progress` and `done` are the original
  contract; agents that predate the five-stage flow depend on them. Relabel, never rename.
- **A ticket "waiting" on a dependency is amber; a hand-written `blocked_reason` is red.** Both
  count as blocked, because the board should not hide either, but only one needs a human.
- **Numbers can skip.** A create that loses a duplicate-id race still consumes a sequence value. That
  is the price of never reusing one.
- **`tickets.section` is still in the database.** Nothing reads or writes it. The migration did not
  drop it so that nothing here is destructive.

- **Only `**bold**` renders in titles.** One rule, deliberately, so game keywords stand out. It is
  not meant to grow into markdown.
- **Dropping a card into In progress assigns it; the other two columns do not.** In progress is a
  claim. This lives in the UI, not the API, because it uses the viewer's "Working as" handle rather
  than their GitHub login.
- **Column counts read `filtered/total`.** A filtered board that hides the backlog size is a lie.
- **An empty `WRITER_LOGINS` means nobody can write.** It fails closed on purpose.

## Checks

```bash
npm run typecheck
npm run build
```

There is no test suite. The SQL in `drizzle/0000_init.sql` and the seed transform were verified
against an in-process Postgres; if you change either, verify them the same way rather than on the
live database.
