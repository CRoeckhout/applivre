-- 0019 — Resserre la définition d'une victoire bingo côté badges.
-- Une case "complétée" exige désormais que le user_book associé soit en
-- statut 'read'. La version précédente comptait toute case ayant un
-- user_book_id assigné, ce qui permettait de débloquer first_bingo /
-- bingo_completed:N en alignant 5 livres non terminés.

create or replace function public._bingo_has_win(p_bingo_id uuid)
returns boolean
language sql stable as $$
  with cells as (
    select distinct bc.cell_index
    from public.bingo_completions bc
    join public.user_books ub on ub.id = bc.user_book_id
    where bc.bingo_id = p_bingo_id
      and ub.status = 'read'
  )
  select exists (
    select 1 from (values
      (array[0,1,2,3,4]),
      (array[5,6,7,8,9]),
      (array[10,11,12,13,14]),
      (array[15,16,17,18,19]),
      (array[20,21,22,23,24]),
      (array[0,5,10,15,20]),
      (array[1,6,11,16,21]),
      (array[2,7,12,17,22]),
      (array[3,8,13,18,23]),
      (array[4,9,14,19,24]),
      (array[0,6,12,18,24]),
      (array[4,8,12,16,20])
    ) as patterns(p)
    where (select count(*) from cells where cell_index = any(p)) = 5
  );
$$;
