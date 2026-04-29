-- 0030 — RPC admin pour identifier le premier utilisateur qui a ajouté un
-- livre dans son étagère, avec son email, son username, son avatar, sa date
-- de création de compte, le nombre de livres qu'il a ajoutés au catalogue
-- (ISBN dont il est le premier uploader) et le total de livres dans sa
-- bibliothèque.
--
-- Le livre catalogue (`public.books`) ne porte pas de `created_by` : on
-- considère donc comme "uploader" le premier `user_books` créé pour cet ISBN.
--
-- Reservé aux admins (`profiles.is_admin = true`) afin de protéger l'accès
-- à `auth.users.email`. SECURITY DEFINER pour traverser RLS et lire auth.

create or replace function public.admin_book_uploader(p_isbn text)
returns table (
  user_id uuid,
  email text,
  username text,
  display_name text,
  avatar_url text,
  account_created_at timestamptz,
  added_at timestamptz,
  added_count bigint,
  library_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with first_ub as (
    select ub.user_id, ub.created_at as added_at
    from public.user_books ub
    where ub.book_isbn = p_isbn
    order by ub.created_at asc
    limit 1
  )
  select
    f.user_id,
    u.email::text,
    p.username,
    p.display_name,
    p.avatar_url,
    p.created_at as account_created_at,
    f.added_at,
    (
      select count(*) from public.user_books ub2
      where ub2.user_id = f.user_id
        and ub2.created_at = (
          select min(ub3.created_at) from public.user_books ub3
          where ub3.book_isbn = ub2.book_isbn
        )
    ) as added_count,
    (select count(*) from public.user_books ub4 where ub4.user_id = f.user_id) as library_count
  from first_ub f
  left join auth.users u on u.id = f.user_id
  left join public.profiles p on p.id = f.user_id;
end;
$$;

grant execute on function public.admin_book_uploader(text) to authenticated;
