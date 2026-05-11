-- 0061 — Border N-slice (slice_extras)
-- Étend les bordures avec une grille N-slice configurable : `slice_extras`
-- est une jsonb optionnelle contenant les cuts X/Y de la grille et la
-- matrice de modes par cellule (stretch / round / fixed). 2v + 2h cuts
-- → 9 cells (= 9-slice classique) ; ajouter une coupe crée une row/col
-- supplémentaire. Permet d'ancrer des ornements à des positions arbitraires
-- sans déformation.
--
-- Format JSON :
--   {
--     "cutsX": [int...],         // positions x en coords source, strict dans (0, image_width)
--     "cutsY": [int...],         // positions y, strict dans (0, image_height)
--     "modes": [[mode...]...]    // matrice (cutsY+1) × (cutsX+1), mode par cellule
--   }
--   mode ∈ ('stretch'|'round'|'fixed')
--
-- Validation côté admin + côté store rowToDef (fallback rendering 9-slice
-- classique si shape invalide). Pas de contrainte CHECK SQL : jsonb shape
-- enforced uniquement applicativement, comme pour les autres jsonb du repo.
--
-- Bordures existantes : `slice_extras` NULL ⇒ le rendering app/admin dérive
-- une grille 9-slice classique à partir de slice_top/right/bottom/left +
-- repeat_mode. Pas de data migration nécessaire.

alter table public.border_catalog
  add column if not exists slice_extras jsonb;
