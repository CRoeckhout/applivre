-- 0025 — Border card padding
-- Permet au cadre de contrôler le padding interne de la card qu'il enveloppe.
-- Default 0 : avec un cadre custom appliqué, la card colle aux edges du frame
-- sauf si l'admin spécifie une valeur. Sans cadre custom, le padding hardcodé
-- côté composant (p-5 / p-6) s'applique inchangé — cette colonne n'est lue
-- que si un cadre actif est présent.

alter table public.border_catalog
  add column if not exists card_padding int not null default 0
    check (card_padding >= 0);
