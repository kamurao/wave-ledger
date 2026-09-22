-- Wave Ledger schema.
--
-- `history` used to be a JSON array on each ticket, capped at 40 entries and
-- resent in full on every write because the old backend had no append. Its own
-- table fixes both: appends are appends, and the Activity tab pages instead of
-- truncating.

create table if not exists tickets (
  id          text primary key,                  -- slug ("t-fast-forward") or random id
  title       text not null,
  kind        text not null default 'feature',   -- feature | question
  status      text not null default 'todo',      -- todo | in_progress | done
  assignee    text,                              -- handle, null = unassigned
  section     text not null default 'Unsorted',
  branch      text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create table if not exists ticket_events (
  id         bigserial primary key,
  ticket_id  text not null references tickets(id) on delete cascade,
  at         timestamptz not null default now(),
  actor      text not null,                      -- '@kamurao' | 'claude'
  text       text not null
);

create index if not exists ticket_events_ticket_id_at_idx
  on ticket_events (ticket_id, at desc);

create index if not exists tickets_updated_at_idx
  on tickets (updated_at desc);

create index if not exists tickets_status_idx
  on tickets (status);
