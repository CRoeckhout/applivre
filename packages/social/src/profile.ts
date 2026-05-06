// Profile lens : registry permettant à l'app hôte de fournir au package
// un moyen de résoudre un user_id en profil affichable (avatar + pseudo).
// Le package ne sait pas comment l'app stocke ses profils — Grimolia query
// la table `profiles` via une RPC, une autre app pourrait taper un autre
// service. La forme retournée est minimale et figée.

import { useQuery } from '@tanstack/react-query';

import type { UserId } from './types';

// Sous-ensemble visuel des préférences publié par l'app hôte. Le package
// ne fait que transporter le blob ; chaque clé est optionnelle parce que
// d'autres apps (musique, jeux) auront un set de champs différent. Le
// rendu (CardFrame, AvatarFrame, fonts) reste entièrement côté hôte.
export type SocialProfileAppearance = Record<string, unknown>;

export type SocialProfile = {
  id: UserId;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  // Statut premium effectif. Cosmétique (mention "Premium" affichée à côté
  // des badges). La date d'expiration reste privée côté DB.
  is_premium?: boolean | null;
  // Apparence visuelle publique (cadre photo, fond, bordure, police,
  // couleurs). Whitelist côté DB — aucune donnée privée.
  appearance?: SocialProfileAppearance | null;
  // IDs des badges débloqués, triés du plus récent au plus ancien. Le
  // package ne connaît pas le catalog de badges (entièrement TS côté hôte).
  badge_keys?: string[];
};

export type ProfileResolver = (
  userIds: UserId[],
) => Promise<Record<UserId, SocialProfile>>;

let _resolver: ProfileResolver | null = null;

export function configureProfileResolver(resolver: ProfileResolver): void {
  _resolver = resolver;
}

function getResolver(): ProfileResolver {
  if (!_resolver) {
    throw new Error(
      '@grimolia/social: profile resolver not configured. Call configureProfileResolver(...) at app boot.',
    );
  }
  return _resolver;
}

export async function resolveProfiles(
  userIds: UserId[],
): Promise<Record<UserId, SocialProfile>> {
  if (userIds.length === 0) return {};
  return getResolver()(userIds);
}

const STALE_MS = 1000 * 60 * 5;

export function useProfile(userId: UserId | null | undefined) {
  return useQuery({
    queryKey: ['social', 'profile', userId ?? ''],
    queryFn: async () => {
      const map = await resolveProfiles([userId!]);
      return map[userId!] ?? null;
    },
    enabled: Boolean(userId),
    staleTime: STALE_MS,
  });
}

// Batch resolver — préférer celui-ci pour une liste (évite N+1 requêtes).
// La queryKey est triée + dédupliquée pour partager le cache entre listes
// permutées contenant les mêmes ids.
export function useProfiles(userIds: UserId[]) {
  const sorted = Array.from(new Set(userIds)).sort();
  return useQuery({
    queryKey: ['social', 'profiles', sorted],
    queryFn: () => resolveProfiles(sorted),
    enabled: sorted.length > 0,
    staleTime: STALE_MS,
  });
}
