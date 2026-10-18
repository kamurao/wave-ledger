-- Deleted tickets: a DELETE on the open board moves a ticket out of sight rather
-- than dropping the row, so anyone can delete and anyone can put it back. The
-- row, its number, history and comments all stay. Purging for good is still a
-- separate, signed-in-only call.
--
-- Additive and idempotent.

alter table tickets
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;
