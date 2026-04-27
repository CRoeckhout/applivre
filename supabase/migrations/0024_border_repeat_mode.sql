-- 0024 — Border repeat mode
-- Ajoute le mode de remplissage des bandes edges/center : équivalent CSS
-- `border-image-repeat`. `stretch` (default, comportement existant) étire
-- le slice. `round` tile le slice avec un count entier scalé pour rentrer
-- pile, sans clipping — idéal pour les motifs répétitifs (chaînettes,
-- guirlandes, bordures dessinées main).

alter table public.border_catalog
  add column if not exists repeat_mode text not null default 'stretch'
    check (repeat_mode in ('stretch','round'));
