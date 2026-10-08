-- 0077 — Soumission de livres introuvables aux admins.
--
-- Quand un scan ISBN ne remonte rien sur aucune plateforme (resolve-book
-- → 404), l'user peut soumettre le livre via un formulaire. La soumission
-- part en file `pending` côté admin, qui corrige si besoin puis approuve
-- (upsert dans `books`) ou refuse avec un motif.
--
-- `book_isbn` = clé utilisée localement par l'user (ISBN réel ou
-- `manual-<uuid>`), figée à la soumission : le livre est ajouté tout de
-- suite à sa biblio sous cette clé, l'approbation écrit la row `books`
-- correspondante (upsert — la sync client l'a peut-être déjà poussée).
--
-- Contenu :
--   1. Table `book_submissions` + RLS (self insert/select, admin select).
--   2. Bucket `book-submission-covers` (photos de couverture).
--   3. RPC `decide_book_submission` (admin) : approve | reject.
--   4. RPCs d'autocomplétion `search_book_authors` / `search_book_categories`
--      sur le catalogue (`books.authors` / `books.categories` sont des text[]).

-- ═════════════ 1. Table book_submissions ═════════════

create table if not exists public.book_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_isbn text not null,
  isbn text,
  title text not null check (length(trim(title)) > 0),
  pages integer not null check (pages > 0),
  authors text[] not null default '{}',
  categories text[] not null default '{}',
  published_at text,
  cover_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decision_reason text,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists book_submissions_pending_idx
  on public.book_submissions (created_at desc)
  where status = 'pending';

create index if not exists book_submissions_user_idx
  on public.book_submissions (user_id, created_at desc);

alter table public.book_submissions enable row level security;

drop policy if exists "book_submissions self select" on public.book_submissions;
create policy "book_submissions self select"
  on public.book_submissions for select
  using (auth.uid() = user_id);

drop policy if exists "book_submissions admin select" on public.book_submissions;
create policy "book_submissions admin select"
  on public.book_submissions for select
  using (public.is_caller_admin());

-- Insert self uniquement, toujours en `pending` sans décision pré-remplie.
-- Pas d'update/delete côté user : les transitions passent par la RPC admin.
drop policy if exists "book_submissions self insert" on public.book_submissions;
create policy "book_submissions self insert"
  on public.book_submissions for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and decision_reason is null
    and decided_at is null
    and decided_by is null
  );

-- ═════════════ 2. Bucket couvertures ═════════════
-- Même modèle que 0028 : lecture publique (la cover_url finit dans `books`),
-- écriture dans son propre dossier `{userId}/...`, immuable.

insert into storage.buckets (id, name, public)
values ('book-submission-covers', 'book-submission-covers', true)
on conflict (id) do nothing;

drop policy if exists "book-submission-covers public read" on storage.objects;
create policy "book-submission-covers public read"
  on storage.objects for select
  using (bucket_id = 'book-submission-covers');

drop policy if exists "book-submission-covers owner insert" on storage.objects;
create policy "book-submission-covers owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'book-submission-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ═════════════ 3. RPC decide_book_submission ═════════════
-- `p_book` (optionnel, approve uniquement) = champs corrigés par l'admin :
-- { title, authors, pages, published_at, cover_url, categories }. Les clés
-- absentes retombent sur la valeur soumise. La clé `books.isbn` reste
-- `book_isbn` (référencée par la biblio de l'user).

create or replace function public.decide_book_submission(
  p_submission_id uuid,
  p_decision text,
  p_reason text default null,
  p_book jsonb default null
)
returns public.book_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.book_submissions;
  v_book jsonb := coalesce(p_book, '{}'::jsonb);
begin
  if not public.is_caller_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision: %', p_decision using errcode = '22023';
  end if;

  select * into v_row
    from public.book_submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;

  if p_decision = 'approve' then
    insert into public.books (
      isbn, title, authors, pages, published_at, cover_url, categories, source, cached_at
    )
    values (
      v_row.book_isbn,
      coalesce(nullif(trim(v_book->>'title'), ''), v_row.title),
      case when v_book ? 'authors'
        then array(select jsonb_array_elements_text(v_book->'authors'))
        else v_row.authors end,
      case when v_book ? 'pages'
        then nullif(v_book->>'pages', '')::integer
        else v_row.pages end,
      case when v_book ? 'published_at'
        then nullif(trim(v_book->>'published_at'), '')
        else v_row.published_at end,
      case when v_book ? 'cover_url'
        then nullif(trim(v_book->>'cover_url'), '')
        else v_row.cover_url end,
      case when v_book ? 'categories'
        then array(select jsonb_array_elements_text(v_book->'categories'))
        else v_row.categories end,
      'manual',
      now()
    )
    on conflict (isbn) do update
      set title = excluded.title,
          authors = excluded.authors,
          pages = excluded.pages,
          published_at = excluded.published_at,
          cover_url = excluded.cover_url,
          categories = excluded.categories,
          source = excluded.source,
          cached_at = excluded.cached_at;
  end if;

  update public.book_submissions
     set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
         decision_reason = nullif(trim(coalesce(p_reason, '')), ''),
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_submission_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.decide_book_submission(uuid, text, text, jsonb) to authenticated;

-- ═════════════ 4. Autocomplétion auteurs / genres ═════════════
-- Distinct sur les text[] du catalogue. Préfixe d'abord, puis plus court.
-- Seq scan acceptable à la taille actuelle du catalogue ; à indexer
-- (pg_trgm sur une vue matérialisée) si ça devient lent.

create or replace function public.search_book_authors(
  p_query text,
  p_limit integer default 8
)
returns setof text
language sql
stable
set search_path = public
as $$
  select name
    from (
      select distinct trim(a) as name
        from public.books b, unnest(b.authors) a
       where trim(a) ilike '%' || trim(p_query) || '%'
    ) s
   where length(trim(p_query)) >= 2
   order by (name ilike trim(p_query) || '%') desc, length(name), name
   limit least(greatest(p_limit, 1), 20);
$$;

-- Catégories normalisées comme `lib/genre.ts::normalizeCategory` : premier
-- segment avant « / » (« Fiction / Fantasy » → « Fiction »).
create or replace function public.search_book_categories(
  p_query text,
  p_limit integer default 8
)
returns setof text
language sql
stable
set search_path = public
as $$
  select name
    from (
      select distinct trim(split_part(c, '/', 1)) as name
        from public.books b, unnest(b.categories) c
    ) s
   where name <> ''
     and name ilike '%' || trim(coalesce(p_query, '')) || '%'
   order by (name ilike trim(coalesce(p_query, '')) || '%') desc, length(name), name
   limit least(greatest(p_limit, 1), 20);
$$;

grant execute on function public.search_book_authors(text, integer) to anon, authenticated;
grant execute on function public.search_book_categories(text, integer) to anon, authenticated;
