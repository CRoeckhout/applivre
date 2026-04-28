-- 0028 — Bucket Storage pour les screenshots de rapports de bug.
-- Lecture publique (URL embarquée dans la tâche ClickUp pour aperçu direct).
-- Écriture limitée à l'utilisateur authentifié, dans son propre dossier
-- `{userId}/...`. Pas d'update/delete : un screenshot de bug est immuable.

insert into storage.buckets (id, name, public)
values ('bug-screenshots', 'bug-screenshots', true)
on conflict (id) do nothing;

drop policy if exists "bug-screenshots public read" on storage.objects;
create policy "bug-screenshots public read"
  on storage.objects for select
  using (bucket_id = 'bug-screenshots');

drop policy if exists "bug-screenshots owner insert" on storage.objects;
create policy "bug-screenshots owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'bug-screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
