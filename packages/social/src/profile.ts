// Profile lens : registry permettant à l'app hôte de fournir au package
// un moyen de résoudre un user_id en profil affichable (avatar + pseudo).
// Le package ne sait pas comment l'app stocke ses profils — Grimolia query
// la table `profiles` via une RPC, une autre app pourrait taper un autre
// service. La forme retournée est minimale et figée.

import { useQuery } from '@tanstack/react-query';

import type { UserId } from './types';

export type SocialProfile = {
  id: UserId;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
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

async function resolveProfiles(
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
