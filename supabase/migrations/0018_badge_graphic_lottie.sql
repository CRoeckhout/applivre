-- 0018 — Badge catalog : support Lottie en plus du SVG
-- Étend la contrainte CHECK sur graphic_kind pour accepter 'lottie'.
-- Le payload est alors du JSON Lottie stringifié (validé par l'Edge Function
-- validate-badge-graphic). graphic_tokens pour Lottie = mapping
-- "layer_name" → "#hex_color", consommé au render via colorFilters
-- (lottie-react-native côté app, lottie-react côté admin preview).

alter table public.badge_catalog
  drop constraint if exists badge_catalog_graphic_kind_check;

alter table public.badge_catalog
  add constraint badge_catalog_graphic_kind_check
  check (graphic_kind in ('svg', 'lottie'));
