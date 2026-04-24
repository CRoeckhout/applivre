-- 0010 BACKFILL — À exécuter UNE FOIS après 0010_read_cycles.sql
-- Crée rétroactivement un cycle par user_book ayant des sessions et
-- rattache les sessions orphelines (cycle_id is null) à ce cycle.

do $$
declare
  rec record;
  new_cycle uuid;
  derived_finished timestamptz;
  derived_outcome public.read_cycle_outcome;
  derived_final int;
  book_status public.reading_status;
begin
  for rec in
    select distinct user_book_id from public.reading_sessions where cycle_id is null
  loop
    select status into book_status from public.user_books where id = rec.user_book_id;

    derived_outcome := case
      when book_status = 'read' then 'read'::public.read_cycle_outcome
      when book_status = 'abandoned' then 'abandoned'::public.read_cycle_outcome
      else null
    end;

    if derived_outcome is not null then
      select started_at, stopped_at_page
      into derived_finished, derived_final
      from public.reading_sessions
      where user_book_id = rec.user_book_id
      order by started_at desc
      limit 1;
    else
      derived_finished := null;
      derived_final := null;
    end if;

    insert into public.read_cycles
      (user_book_id, index, started_at, finished_at, outcome, final_page)
    select
      rec.user_book_id, 1, min(started_at),
      derived_finished, derived_outcome, derived_final
    from public.reading_sessions
    where user_book_id = rec.user_book_id
    returning id into new_cycle;

    update public.reading_sessions
    set cycle_id = new_cycle
    where user_book_id = rec.user_book_id and cycle_id is null;
  end loop;
end $$;
