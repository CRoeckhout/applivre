-- 0072 — Ajoute cover_url au payload de admin_user_sessions.
--
-- Le panel admin Sessions affiche désormais une miniature de couverture à
-- côté du titre du livre (cohérence visuelle avec les autres panels users).
-- Pas de changement de signature, juste un champ supplémentaire dans le jsonb.

create or replace function public.admin_user_sessions(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public._assert_admin();
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v
  from (
    select
      to_jsonb(rs) || jsonb_build_object(
        'user_book', jsonb_build_object(
          'book_isbn', ub.book_isbn,
          'book', case when b.isbn is null then null else jsonb_build_object(
            'isbn', b.isbn,
            'title', b.title,
            'cover_url', b.cover_url
          ) end
        )
      ) as j
    from public.reading_sessions rs
    join public.user_books ub on ub.id = rs.user_book_id
    left join public.books b on b.isbn = ub.book_isbn
    where ub.user_id = p_user_id
    order by rs.started_at desc
    limit 200
  ) t;
  return v;
end;
$$;

grant execute on function public.admin_user_sessions(uuid) to authenticated;
