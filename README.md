# Wave Ledger

A three-column Kanban board for the **Slay the Tower** (GamePlanning) project, shared between the
people on the project and the Claude Code sessions working in the game repo.

Its distinguishing feature is that **agents are first-class writers**. Every Claude session reads
the board before starting work, moves the matching ticket to In progress, and moves it to Complete
when the work is committed. The board is as much a machine-readable work queue as it is a human UI,
and both halves are load-bearing.

This is a rebuild of a Claude artifact as a Next.js app on Vercel. The move is not a port — it is
about **who is allowed to write**.

---

## Why this exists as its own app

The artifact runtime granted database writes on identity: signed-in viewers could read shared
documents, but only people who could edit the artifact could write to them. Path rules could raise
that floor, never lower it. So the board was readable by anyone with the link and writable only by
Ken and agents acting as him.

A query-parameter scheme could not fix that, because the gate was *who is asking*, not *how the
change was phrased*. A friend opening `?status=done` was refused exactly like a friend clicking a
button.

Here, the auth layer is ours, and it has two settings.

**Open board** (`OPEN_BOARD=1`) — anyone with the link can write, no sign-in, no OAuth app to
stand up. This is the least-ceremony way to get what the move was for: everyone on the project
able to write. Deleting stays off in this mode, so the worst a passer-by can do is reversible, and
agents still authenticate with their token so their writes stay attributable.

**Signed-in board** (`OPEN_BOARD` unset) — the stricter setting:

- **GitHub sign-in** (Auth.js), because everyone involved already has an account and it gives a
  stable handle.
- **An allowlist** of GitHub logins in `WRITER_LOGINS` decides writer vs reader. It fails closed:
  an empty list means nobody but agents.
- **A separate bearer token** for agents, checked in the same place as the session cookie.

Everything else in this repo is a port of the artifact. This part is the upgrade.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run db:migrate             # creates the two tables (idempotent)
npm run db:seed                # loads the 28 tickets in seed-data/
npm run dev
```

You need a Postgres connection string in `DATABASE_URL`. Neon's free tier is plenty; so is any
other Postgres. The app never uses provider-specific features.

Node 22.18 or newer, because the migrate and seed scripts are TypeScript run directly by Node's
own type stripping — there is no build step or loader in front of them.

Other scripts: `npm run build`, `npm run typecheck`, `npm run db:seed -- --reset` (wipes first).

---

## Deploying to Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Framework detection picks up
   Next.js; no build settings to change.

2. **Attach a database.** Project → *Storage* → *Create Database* → **Neon**. Connecting it injects
   `DATABASE_URL` into all environments automatically.

3. **Create a GitHub OAuth app** at
   [github.com/settings/developers](https://github.com/settings/developers) → *New OAuth App*:

   - Homepage URL: `https://<your-app>.vercel.app`
   - Authorization callback URL: `https://<your-app>.vercel.app/api/auth/callback/github`

   For local development, make a second app pointing at `http://localhost:3000`.

4. **Set the remaining environment variables** (Project → *Settings* → *Environment Variables*):

   | Variable | Value |
   | --- | --- |
   | `AUTH_SECRET` | any long random string — `npx auth secret` generates one |
   | `AUTH_GITHUB_ID` | from the OAuth app |
   | `AUTH_GITHUB_SECRET` | from the OAuth app |
   | `WRITER_LOGINS` | `kamurao,Romaium,sunnyisabot123` |
   | `WAVE_LEDGER_TOKEN` | the agents' bearer token (see below) |

   To skip steps 3 and 4 entirely, set `OPEN_BOARD=1` and `WAVE_LEDGER_TOKEN` and nothing else.
   Everyone with the link can then write, and you can add GitHub sign-in later without migrating
   anything — the two modes share all their data.

   Generate an agent token with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

5. **Redeploy** so the new variables take effect.

6. **Create the schema and load the data.** Copy `DATABASE_URL` out of the Vercel dashboard (or run
   `vercel env pull .env.local`), then locally:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

7. **Check that readers can actually read.** Vercel's *Deployment Protection* is off for production
   by default but on for previews; if a friend hits a login wall, that is what they are hitting, not
   this app.

Until the database is reachable, the board renders a setup page listing exactly what is missing, and
the API answers `503` with the reason rather than a blank 500.

---

## Data model

Two tables. The artifact kept history as a JSON array on each ticket, capped at 40 entries and
resent in full on every write, because its backend had no append primitive. Its own table fixes
both: appends are appends, and the Activity tab pages instead of truncating.

```sql
create table tickets (
  id          text primary key,            -- 't-fast-forward' or a random id
  title       text not null,               -- supports **bold**, and nothing else
  kind        text not null default 'feature',   -- feature | question
  status      text not null default 'todo',      -- todo | in_progress | done
  assignee    text,                        -- handle, null = unassigned
  section     text not null default 'Unsorted',  -- KEN | FRANCO | SHAUN | Unsorted
  branch      text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1   -- optimistic concurrency
);

create table ticket_events (
  id         bigserial primary key,
  ticket_id  text not null references tickets(id) on delete cascade,
  at         timestamptz not null default now(),
  actor      text not null,               -- '@kamurao' | 'claude'
  text       text not null                -- 'created', 'moved to Complete'
);
```

Both id shapes stay supported: human slugs written by agents, and random ids from the UI's add
button.

---

## API

The contract agents use. Humans authenticate with a session cookie; agents send
`Authorization: Bearer <WAVE_LEDGER_TOKEN>`. Both are checked in one place.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/tickets` | `{ tickets: [...] }`. Filters: `status`, `assignee` (`__none` for unassigned), `q` |
| `POST` | `/api/tickets` | Create. Body is the ticket minus timestamps |
| `GET` | `/api/tickets/:id` | `{ ticket, events }` |
| `PATCH` | `/api/tickets/:id` | Partial update. Honours `If-Match-Version: <version>` |
| `DELETE` | `/api/tickets/:id` | |
| `GET` | `/api/tickets/:id/events` | That ticket's history |
| `POST` | `/api/tickets/:id/events` | Append one history line |
| `GET` | `/api/events` | Flattened activity feed. `limit`, `before` (keyset cursor) |
| `GET` | `/api/stream` | Server-sent events, one per change |
| `POST` | `/api/apply` | Applies an update-by-link (see below) |

Two rules make this safe for two agents on one board:

- **Every mutation appends its own `ticket_events` row server-side.** Callers never hand-maintain
  history, and never touch `updated_at`.
- **`PATCH` honours `If-Match-Version` against `version`** and returns `409` with the current row on
  a mismatch. The check is folded into the `UPDATE`'s own `WHERE` clause, so the compare and the
  write are one statement — two racing writers cannot both win. The version can travel as
  `if_version` in the JSON body instead, if that is easier.

  It is deliberately **not** the standard `If-Match` header. A CDN is entitled to evaluate that one
  against the response ETag and answer `412` itself — which on Vercel happens *after* the row has
  already been written, so the caller sees a failure for a change that landed and a retry
  double-applies it. Plain `If-Match` is still read as a last resort so older callers degrade rather
  than break, but nothing should depend on it.

```bash
# claim a ticket
curl -X PATCH https://<your-app>.vercel.app/api/tickets/t-fast-forward \
  -H "Authorization: Bearer $WAVE_LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "If-Match-Version: 3" \
  -d '{"status":"in_progress","assignee":"kamurao","branch":"feature/ken-changes"}'
```

---

## Update-by-link

Designed for the artifact, never shippable there, and the whole contribution path for anyone who
cannot write. A change expressed as a query string, so it can travel through chat:

```
/?add=Frost%20tower%20rework&kind=feature&section=KEN
/?t=fast-forward&status=done&by=Romaium
/?id=t-fast-forward&assignee=Romaium&branch=feature/ff
```

- `add` creates. `id` targets exactly. `t` targets by unique title substring — an ambiguous match is
  an error, and the page says which tickets matched.
- Settable: `title`, `status`, `kind`, `assignee`, `section`, `branch`, `notes`. `by` is the handle
  credited in the log. An empty value clears a field (`&branch=`).
- **It never auto-applies.** Opening the link shows the target ticket and a field-by-field
  before/after and waits for a click. Link previews, prefetches and back-button navigations cannot
  mutate the board, because resolving a link and applying one are different requests.
- **There is no delete verb**, so a malicious or mistaken link is always recoverable.
- The ticket editor's **Copy link** button composes one from the current form state, including only
  the fields that actually differ. Composing needs no permission; applying needs write access.

---

## Realtime

The client subscribes to `/api/stream` and revalidates when the board moves. Postgres
`LISTEN/NOTIFY` would be tidier, but it needs a connection that outlives a serverless invocation, so
the route fingerprints the board on a short server-side interval instead — one connection per
viewer, no extra infrastructure.

Vercel caps streaming duration, so the server closes cleanly at ~50s and `EventSource` reconnects.
After three failed attempts the client gives up and falls back to polling `GET /api/tickets` every
10s, which is the documented v1 fallback. The header pill says which mode it is in.

---

## Agent integration

The game repo's `CLAUDE.md` must be updated, or sessions will silently keep writing to the dead
artifact. The replacement text is in [docs/game-repo-CLAUDE.md](docs/game-repo-CLAUDE.md), and the
board's own **Workflow** tab renders it with a copy button.

Keep from the old instructions: the `t-<slug>` convention, the "questions don't get tickets" rule,
the handle list, and the optimistic-concurrency requirement. Drop: the manual `history` array
resend, `updated_at` bookkeeping, and the `section: "Unsorted"` default — all server-side now.

---

## Decisions carried over deliberately

Each of these was chosen on purpose in the artifact and is easy to "simplify" away by accident.

1. **`**bold**` in titles, nothing else.** One rule, applied to titles and history text, so game
   keywords (**slow**, **burn**) pop in a wall of similar tickets. It is not markdown.
2. **History is append-only and shows the actor.** With agents writing to the same board as people,
   the log is the only way to reconstruct who moved what.
3. **In progress auto-assigns; To do and Complete do not.** Moving something to In progress is a
   claim. The other two aren't.
4. **The Workflow tab ships with the app.** The rules live next to the board, so it explains itself
   to anyone — or anything — that opens it.
5. **Counts show `filtered/total`.** A filtered board that hides the real backlog size is a lie.
6. **Dialogs, not inline editing.** Every field is editable in one place, which keeps the card small
   enough to scan.
7. **Timestamps are relative in the UI, absolute in the tooltip and the database.**
8. **The palette and type pairing are lifted verbatim**, tokens and all, in `src/app/globals.css`.

---

## Layout

```
src/app/            routes: the board page and the API
src/components/     the board UI (client) and auth buttons (server)
src/lib/            schema, data access, auth, link parsing
  link.ts           update-by-link, the half with no database in it
  linkPlan.ts       resolving a link against the board (server-only)
  tickets.ts        every read and write, including the version-pinned update
drizzle/            the schema as SQL
scripts/            migrate and seed
seed-data/tickets/  the 28 tickets exported from the artifact
```
