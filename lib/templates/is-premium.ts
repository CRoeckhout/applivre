import { useBorderCatalog } from '@/store/border-catalog';
import { useFondCatalog } from '@/store/fond-catalog';
import { useStickerCatalog } from '@/store/sticker-catalog';
import type { PlacedSticker, SheetAppearance } from '@/types/book';

// Détermine si une composition (appearance + stickers) embarque ≥1 élément
// marqué `availability = 'premium'` dans les 3 catalogues. Utilisé au save
// d'un template pour cacher le flag `is_premium` sur la row, et côté preview
// d'une fiche pour gater l'utilisation chez un user freemium.
//
// Les catalogues sont lus via `getState()` (pas de subscription) : appel
// ponctuel à la mutation. Les défauts statiques sont considérés "everyone"
// par construction (pas remontés en DB, donc absents des `remote`).
export function computeTemplatePremiumFlag(
  appearance: Pick<SheetAppearance, 'frame' | 'fond'>,
  stickers: PlacedSticker[] | undefined,
): boolean {
  const borderId = appearance.frame?.borderId;
  if (borderId && borderId !== 'none' && borderId !== 'perso') {
    const entry = useBorderCatalog
      .getState()
      .remote.find((e) => e.def.id === borderId);
    if (entry?.availability === 'premium') return true;
  }

  const fondId = appearance.fond?.fondId;
  if (fondId && fondId !== 'none') {
    const entry = useFondCatalog
      .getState()
      .remote.find((e) => e.def.id === fondId);
    if (entry?.availability === 'premium') return true;
  }

  if (stickers && stickers.length > 0) {
    const stickerCatalog = useStickerCatalog.getState().remote;
    const ids = new Set(stickers.map((s) => s.stickerId));
    for (const entry of stickerCatalog) {
      if (entry.availability === 'premium' && ids.has(entry.def.id)) return true;
    }
  }

  return false;
}
