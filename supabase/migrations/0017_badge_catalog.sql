-- 0017 — Badge catalog server-authoritative
-- Le serveur tient la liste officielle des badges, leurs règles d'obtention
-- (rule jsonb) et leur visuel SVG. Les apps clientes consomment ce catalog
-- en lecture et appellent `evaluate_user_badges()` pour débloquer.
-- Les règles, dates de validité et retraits sont pilotables sans déploiement.

-- ═════════════ Catalog table ═════════════

create table if not exists public.badge_catalog (
  badge_key       text primary key,
  title           text not null,
  description     text not null,
  rule            jsonb not null,
  graphic_kind    text not null default 'svg' check (graphic_kind in ('svg')),
  graphic_payload text not null,
  graphic_tokens  jsonb not null default '{}'::jsonb,
  active_from     timestamptz,
  active_until    timestamptz,
  retired_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id)
);

create index if not exists badge_catalog_active_idx
  on public.badge_catalog (active_from, active_until)
  where retired_at is null;

create or replace function public._touch_badge_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists badge_catalog_touch on public.badge_catalog;
create trigger badge_catalog_touch
before update on public.badge_catalog
for each row execute function public._touch_badge_catalog_updated_at();

-- ═════════════ Admin flag ═════════════
-- Activé manuellement via SQL (`update profiles set is_admin = true where id = '…'`).
-- Sert de garde RLS sur badge_catalog en écriture.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ═════════════ Helpers : bingo win + streak ═════════════

create or replace function public._bingo_has_win(p_bingo_id uuid)
returns boolean
language sql stable as $$
  with cells as (
    select distinct cell_index from public.bingo_completions where bingo_id = p_bingo_id
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

-- Plus longue série de jours consécutifs présents dans reading_streak_days.
-- Astuce classique : grouper par (date - row_number()), chaque run forme un groupe.
create or replace function public._streak_max(p_user uuid)
returns int
language sql stable as $$
  with days as (
    select day::date as d
    from public.reading_streak_days
    where user_id = p_user
  ),
  grouped as (
    select d - (row_number() over (order by d))::int as grp
    from days
  )
  select coalesce(max(c), 0)::int from (
    select count(*) as c from grouped group by grp
  ) g;
$$;

-- ═════════════ Rule dispatcher ═════════════
-- Interprète une rule jsonb (`{"type": "...", "min": N}`) et retourne true
-- si l'utilisateur p_user satisfait la condition.

create or replace function public.check_badge_rule(p_user uuid, p_rule jsonb)
returns boolean
language plpgsql stable as $$
declare
  rt text := p_rule->>'type';
  req int := coalesce((p_rule->>'min')::int, 1);
  v int;
begin
  case rt
    when 'first_sheet' then
      select count(*) into v
      from public.reading_sheets rs
      join public.user_books ub on ub.id = rs.user_book_id
      where ub.user_id = p_user;
      return v >= 1;

    when 'sheets_count' then
      select count(*) into v
      from public.reading_sheets rs
      join public.user_books ub on ub.id = rs.user_book_id
      where ub.user_id = p_user;
      return v >= req;

    when 'books_read' then
      select count(*) into v
      from public.user_books
      where user_id = p_user and status = 'read';
      return v >= req;

    when 'first_bingo' then
      select count(*) into v
      from public.bingos b
      where b.user_id = p_user and public._bingo_has_win(b.id);
      return v >= 1;

    when 'bingo_completed' then
      select count(*) into v
      from public.bingos b
      where b.user_id = p_user and public._bingo_has_win(b.id);
      return v >= req;

    when 'streak_max' then
      v := public._streak_max(p_user);
      return v >= req;

    else
      return false;
  end case;
end;
$$;

-- ═════════════ Seed ═════════════
-- Reprend les badges actuels de lib/badges/catalog.ts. Un seul SVG template
-- par défaut, paramétré via graphic_tokens (`{{primary}}` / `{{label}}`).
-- Le label vide pour les badges sans tier (first_sheet / first_bingo).

do $$
declare
  -- Médaille : path normalisé (espaces explicites + leading zeros) pour
  -- éviter le crash RNSVGPathParser InvalidNumber sur Fabric/iOS qui
  -- refuse les compact decimals chainées (ex: M255.59.65, .65 au lieu de 0.65).
  default_svg text :=
    '<svg viewBox="0 0 509.18 496.7" xmlns="http://www.w3.org/2000/svg">'
    || '<path d="M 255.59 0.65 l -1 -0.65 -1 0.65 C 124.31 84.74 11.2 96.11 0 82.35 c 74.02 394.36 192.65 340.34 253.59 413.14 l 1 1.21 1 -1.21 c 60.94 -72.8 179.57 -18.78 253.59 -413.14 -11.2 13.76 -124.31 2.39 -253.59 -81.7 Z" fill="{{primary}}"/>'
    || '<path d="M 224.51 440.15 c -58.01 -22.61 -100.94 -73.26 -126.94 -128.78 -26.88 -56.28 -41.4 -117.45 -52.64 -178.15 0 0 91.05 -5.07 91.05 -5.07 -5.55 83.33 -8.32 171.76 32.1 247.32 13.83 25.16 33.06 47.37 56.43 64.69 h 0 Z" fill="#ffffff" fill-opacity="0.85"/>'
    || '<text x="254.59" y="290" fill="#ffffff" font-size="220" font-weight="700" text-anchor="middle">{{label}}</text>'
    || '</svg>';
begin
  insert into public.badge_catalog
    (badge_key, title, description, rule, graphic_payload, graphic_tokens) values
    ('first_sheet',          'Première fiche',                'Tu as rédigé ta toute première fiche de lecture.',
       '{"type":"first_sheet"}'::jsonb,           default_svg, '{"primary":"#c27b52","label":""}'::jsonb),
    ('first_bingo',          'Premier bingo',                 'Tu as complété ta première ligne (5 livres alignés) sur un bingo.',
       '{"type":"first_bingo"}'::jsonb,           default_svg, '{"primary":"#b04848","label":""}'::jsonb),

    ('sheets_count:1',       '1 fiche de lecture',            'Tu possèdes 1 fiche de lecture.',
       '{"type":"sheets_count","min":1}'::jsonb,  default_svg, '{"primary":"#c27b52","label":"1"}'::jsonb),
    ('sheets_count:5',       '5 fiches de lecture',           'Tu possèdes 5 fiches de lecture.',
       '{"type":"sheets_count","min":5}'::jsonb,  default_svg, '{"primary":"#c27b52","label":"5"}'::jsonb),
    ('sheets_count:10',      '10 fiches de lecture',          'Tu possèdes 10 fiches de lecture.',
       '{"type":"sheets_count","min":10}'::jsonb, default_svg, '{"primary":"#c27b52","label":"10"}'::jsonb),
    ('sheets_count:15',      '15 fiches de lecture',          'Tu possèdes 15 fiches de lecture.',
       '{"type":"sheets_count","min":15}'::jsonb, default_svg, '{"primary":"#c9a13a","label":"15"}'::jsonb),
    ('sheets_count:20',      '20 fiches de lecture',          'Tu possèdes 20 fiches de lecture.',
       '{"type":"sheets_count","min":20}'::jsonb, default_svg, '{"primary":"#c9a13a","label":"20"}'::jsonb),

    ('books_read:10',        '10 livres lus',                 'Tu as lu 10 livres.',
       '{"type":"books_read","min":10}'::jsonb,   default_svg, '{"primary":"#3f8a6a","label":"10"}'::jsonb),
    ('books_read:25',        '25 livres lus',                 'Tu as lu 25 livres.',
       '{"type":"books_read","min":25}'::jsonb,   default_svg, '{"primary":"#3f8a6a","label":"25"}'::jsonb),
    ('books_read:50',        '50 livres lus',                 'Tu as lu 50 livres.',
       '{"type":"books_read","min":50}'::jsonb,   default_svg, '{"primary":"#3a6ea5","label":"50"}'::jsonb),
    ('books_read:100',       '100 livres lus',                'Tu as lu 100 livres.',
       '{"type":"books_read","min":100}'::jsonb,  default_svg, '{"primary":"#7757a3","label":"100"}'::jsonb),
    ('books_read:250',       '250 livres lus',                'Tu as lu 250 livres.',
       '{"type":"books_read","min":250}'::jsonb,  default_svg, '{"primary":"#c9a13a","label":"250"}'::jsonb),

    ('bingo_completed:5',    '5 bingos complétés',            'Tu as complété 5 cartes de bingo.',
       '{"type":"bingo_completed","min":5}'::jsonb,  default_svg, '{"primary":"#b04848","label":"5"}'::jsonb),
    ('bingo_completed:10',   '10 bingos complétés',           'Tu as complété 10 cartes de bingo.',
       '{"type":"bingo_completed","min":10}'::jsonb, default_svg, '{"primary":"#c9a13a","label":"10"}'::jsonb),

    ('streak_max:7',         'Série de 7 jours',              'Ta plus longue série de lecture atteint 7 jours consécutifs.',
       '{"type":"streak_max","min":7}'::jsonb,    default_svg, '{"primary":"#c27b52","label":"7"}'::jsonb),
    ('streak_max:30',        'Série de 30 jours',             'Ta plus longue série de lecture atteint 30 jours consécutifs.',
       '{"type":"streak_max","min":30}'::jsonb,   default_svg, '{"primary":"#3f8a6a","label":"30"}'::jsonb),
    ('streak_max:100',       'Série de 100 jours',            'Ta plus longue série de lecture atteint 100 jours consécutifs.',
       '{"type":"streak_max","min":100}'::jsonb,  default_svg, '{"primary":"#7757a3","label":"100"}'::jsonb),
    ('streak_max:365',       'Série de 365 jours',            'Ta plus longue série de lecture atteint 365 jours consécutifs.',
       '{"type":"streak_max","min":365}'::jsonb,  default_svg, '{"primary":"#c9a13a","label":"365"}'::jsonb)
  on conflict (badge_key) do nothing;
end$$;

-- ═════════════ FK user_badges → badge_catalog ═════════════
-- Sécurité : si la migration 0016 a laissé des rows orphelines (badge_key
-- jamais shippé), on les supprime avant d'ajouter la contrainte. Ne devrait
-- rien toucher car le seed couvre toutes les clés émises côté client.

delete from public.user_badges
where badge_key not in (select badge_key from public.badge_catalog);

alter table public.user_badges
  drop constraint if exists user_badges_badge_key_fk;

alter table public.user_badges
  add constraint user_badges_badge_key_fk
  foreign key (badge_key) references public.badge_catalog(badge_key)
  on update cascade
  on delete restrict;

-- ═════════════ Trigger anti-triche ═════════════
-- Refuse tout INSERT direct dans user_badges qui ne satisfait pas la règle
-- du badge ou qui cible un badge inexistant / retiré / hors période active.
-- L'RPC evaluate_user_badges passe par ce même trigger (idempotent).

create or replace function public._validate_user_badge_insert()
returns trigger
language plpgsql
security invoker
as $$
declare
  cat record;
begin
  select * into cat from public.badge_catalog where badge_key = new.badge_key;
  if not found then
    raise exception 'badge_key % does not exist', new.badge_key;
  end if;
  if cat.retired_at is not null then
    raise exception 'badge % retired', new.badge_key;
  end if;
  if cat.active_from is not null and cat.active_from > now() then
    raise exception 'badge % not yet active', new.badge_key;
  end if;
  if cat.active_until is not null and cat.active_until < now() then
    raise exception 'badge % no longer active', new.badge_key;
  end if;
  if not public.check_badge_rule(new.user_id, cat.rule) then
    raise exception 'badge % not earned by user', new.badge_key
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_badges_validate on public.user_badges;
create trigger user_badges_validate
  before insert on public.user_badges
  for each row execute function public._validate_user_badge_insert();

-- ═════════════ RPC : evaluate_user_badges ═════════════
-- Parcourt le catalog actif, débloque les badges qualifiants pour
-- l'utilisateur courant et retourne la liste des nouvelles clés.
-- Le client appelle cette fonction après chaque action significative
-- (fin de lecture, fiche save, completion bingo, streak day).

create or replace function public.evaluate_user_badges()
returns text[]
language plpgsql
security invoker
as $$
declare
  uid uuid := auth.uid();
  cat record;
  newly text[] := '{}';
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  for cat in
    select badge_key, rule from public.badge_catalog
    where retired_at is null
      and (active_from is null or active_from <= now())
      and (active_until is null or active_until >= now())
  loop
    if exists (
      select 1 from public.user_badges
      where user_id = uid and badge_key = cat.badge_key
    ) then
      continue;
    end if;
    if public.check_badge_rule(uid, cat.rule) then
      insert into public.user_badges (user_id, badge_key, earned_at)
      values (uid, cat.badge_key, now())
      on conflict do nothing;
      newly := array_append(newly, cat.badge_key);
    end if;
  end loop;

  return newly;
end;
$$;

-- ═════════════ RLS sur badge_catalog ═════════════

alter table public.badge_catalog enable row level security;

-- Lecture publique pour utilisateurs authentifiés et anon (catalog public).
drop policy if exists "badge_catalog read" on public.badge_catalog;
create policy "badge_catalog read" on public.badge_catalog
  for select
  using (true);

-- Écritures réservées aux admins (profiles.is_admin = true).
drop policy if exists "badge_catalog admin write" on public.badge_catalog;
create policy "badge_catalog admin write" on public.badge_catalog
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

grant select on public.badge_catalog to anon, authenticated;
grant insert, update, delete on public.badge_catalog to authenticated;
