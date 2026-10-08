-- Game-design board: epics, milestones, and the extra ticket fields a design
-- process needs. Additive and idempotent, so it is safe to run on a live
-- database and safe to run twice. Old agent calls keep working: every new column
-- has a default.
--
-- `tickets.section` (KEN | FRANCO | SHAUN | Unsorted) is no longer read or
-- written; the column is left in place so nothing here is destructive.

create table if not exists milestones (
  id          text primary key,                  -- 'm-prototype'
  name        text not null,
  goal        text not null default '',          -- what "done" means for this milestone
  target_date date,
  status      text not null default 'upcoming',  -- upcoming | active | done
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create table if not exists epics (
  id          text primary key,                  -- 'e-cards'
  name        text not null,
  summary     text not null default '',
  color       text not null default 'e1',        -- e1..e8, a palette slot
  status      text not null default 'active',    -- active | paused | done | archived
  owner       text,                              -- handle, null = unowned
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

alter table tickets
  add column if not exists epic_id        text references epics(id) on delete set null,
  add column if not exists milestone_id   text references milestones(id) on delete set null,
  add column if not exists priority       text not null default 'p2',   -- p0 | p1 | p2 | p3
  add column if not exists estimate       text,                         -- XS | S | M | L | XL
  add column if not exists labels         text[] not null default '{}',
  add column if not exists depends_on     text[] not null default '{}', -- ticket ids
  add column if not exists blocked_reason text not null default '',     -- non-empty = blocked
  add column if not exists design_doc     text not null default '',     -- link to the spec
  add column if not exists criteria       text not null default '',     -- '- [ ] ...' lines
  add column if not exists decision       text not null default '',     -- the answer, for questions
  add column if not exists rank           double precision not null default 0;

create index if not exists tickets_epic_id_idx on tickets (epic_id);
create index if not exists tickets_milestone_id_idx on tickets (milestone_id);
