-- Comments: the discussion on a ticket, kept apart from `ticket_events`. History
-- is the audit trail of what moved; comments are what people said about it, so
-- they can be longer, edited by whoever wrote them, and read top to bottom.
--
-- Additive and idempotent. Deleting a ticket takes its comments with it.

create table if not exists ticket_comments (
  id bigserial primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  at timestamptz not null default now(),
  author text not null,
  body text not null,
  edited_at timestamptz
);

create index if not exists ticket_comments_ticket_id_at_idx on ticket_comments (ticket_id, at);
