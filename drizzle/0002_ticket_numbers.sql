-- Short, permanent ticket numbers (#1, #2, ...) alongside the slug ids, so a
-- ticket can be named in conversation and shared as a link. Numbers come from a
-- sequence and are never reused, even after a ticket is deleted.
--
-- Additive and idempotent. Existing tickets are numbered oldest first.

create sequence if not exists tickets_number_seq;

alter table tickets add column if not exists number integer;

update tickets t
   set number = x.n + (select coalesce(max(number), 0) from tickets)
  from (
    select id, row_number() over (order by created_at, id) as n
      from tickets
     where number is null
  ) x
 where t.id = x.id;

-- Move the sequence past anything already handed out, but never backwards.
do $$
declare
  top integer;
  seq_called boolean;
  seq_last bigint;
begin
  select coalesce(max(number), 0) into top from tickets;
  select is_called, last_value into seq_called, seq_last from tickets_number_seq;
  if top > 0 and (not seq_called or seq_last < top) then
    perform setval('tickets_number_seq', top);
  end if;
end $$;

alter table tickets alter column number set default nextval('tickets_number_seq');
alter table tickets alter column number set not null;

create unique index if not exists tickets_number_key on tickets (number);
