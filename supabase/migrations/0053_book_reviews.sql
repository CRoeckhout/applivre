-- 0052 — Avis publics sur livres.
--
-- Un avis = (user, livre) → note 5★ + commentaire optionnel. Sémantique
-- distincte de user_books.rating (qui reste la note privée de l'étagère
-- perso, non publiée). Un user n'a pas besoin de posséder un livre dans
-- son étagère pour publier un avis : la FK pointe vers books(isbn), pas
-- vers user_books.
--
-- Les votes (upvote / downvote) sont stockés dans book_reviews_votes :
-- table dédiée plutôt que social_reactions, car on veut agréger un score
-- (sum) et trier les avis dessus, pas afficher des emojis.
--
-- Le partage au feed n'est PAS automatique : il passe par l'RPC explicite
-- publish_review_to_feed (cf. migration 0053) appelée quand l'user clique
-- "Publier" dans la modale post-création. "Non merci" = aucun feed entry,
-- définitif.

create table if not exists public.book_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  book_isbn   text not null references public.books(isbn) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, book_isbn)
);

-- Hot path : tous les avis pour un livre, triés par fraîcheur (sera
-- re-trié par score côté RPC).
create index if not exists book_reviews_book_idx
  on public.book_reviews (book_isbn, created_at desc);

-- Lookup inverse : tous les avis d'un user (page profil).
create index if not exists book_reviews_user_idx
  on public.book_reviews (user_id, created_at desc);

alter table public.book_reviews enable row level security;

-- Lecture publique : un avis est par nature publique sur la page du livre.
create policy "book_reviews_select_all"
  on public.book_reviews
  for select
  using (true);

create policy "book_reviews_insert_self"
  on public.book_reviews
  for insert
  with check (auth.uid() = user_id);

create policy "book_reviews_update_self"
  on public.book_reviews
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "book_reviews_delete_self"
  on public.book_reviews
  for delete
  using (auth.uid() = user_id);

-- Trigger updated_at — pattern aligné sur les tables existantes.
create or replace function public.book_reviews_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists book_reviews_touch_updated_at on public.book_reviews;
create trigger book_reviews_touch_updated_at
before update on public.book_reviews
for each row execute function public.book_reviews_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Votes : un user peut upvote (+1) ou downvote (-1) un avis. Une seule voix
-- par couple (review, user) — on toggle / change la valeur via upsert.
-- ---------------------------------------------------------------------------
create table if not exists public.book_reviews_votes (
  review_id   uuid not null references public.book_reviews(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  value       smallint not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  primary key (review_id, user_id)
);

-- Hot path : score agrégé d'un avis (sum + count) — l'index sur la PK
-- (review_id, user_id) couvre déjà le scan par review_id.

alter table public.book_reviews_votes enable row level security;

create policy "book_reviews_votes_select_all"
  on public.book_reviews_votes
  for select
  using (true);

create policy "book_reviews_votes_insert_self"
  on public.book_reviews_votes
  for insert
  with check (auth.uid() = user_id);

create policy "book_reviews_votes_update_self"
  on public.book_reviews_votes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "book_reviews_votes_delete_self"
  on public.book_reviews_votes
  for delete
  using (auth.uid() = user_id);
