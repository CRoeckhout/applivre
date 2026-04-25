-- Ajout du statut 'wishlist' à l'enum reading_status.
-- Wishlist devient un statut exclusif (au même titre que to_read / reading / read / abandoned).
-- ALTER TYPE ADD VALUE doit être exécuté hors d'une transaction qui réutilise
-- la nouvelle valeur ; la migration n'utilise pas la valeur, donc safe.

alter type public.reading_status add value if not exists 'wishlist';
