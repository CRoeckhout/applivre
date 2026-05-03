import type { ImageSourcePropType } from 'react-native';
import type { CatalogLockReason } from '@/lib/borders/catalog';

// Définition d'un cadre photo dispo dans le catalog. PNG only en MVP.
// `imageSize` reflète les dimensions natives du PNG ; sert à mettre à
// l'échelle `imagePadding` (exprimé en px natif) quand le cadre est rendu
// à une taille DOM/RN différente. `imageScale` est la fraction du cadre
// occupée par la photo (0..1).
export type AvatarFrameDef = {
  id: string;
  label: string;
  source?: ImageSourcePropType;
  imageSize?: { width: number; height: number };
  imageScale: number;
  imagePadding: number;
  // Verrou côté user (cf. BorderDef pour la sémantique).
  locked?: boolean;
  lockReason?: CatalogLockReason;
};

// Catalog local. Le sentinel 'none' représente l'absence de cadre — l'avatar
// est rendu comme avant (cercle simple sans overlay). Les cadres réels
// viennent tous de la DB (table `avatar_frame_catalog`).
export const AVATAR_FRAMES: AvatarFrameDef[] = [
  { id: 'none', label: 'Aucun cadre', imageScale: 1, imagePadding: 0 },
];

export const DEFAULT_AVATAR_FRAME_ID = 'none';

export function getAvatarFrame(id: string): AvatarFrameDef {
  return AVATAR_FRAMES.find((f) => f.id === id) ?? AVATAR_FRAMES[0];
}
