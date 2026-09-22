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

## Things that look like bugs and are not

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
