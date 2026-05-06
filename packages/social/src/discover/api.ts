import { getClient } from '../client';
import type { SocialProfile, SocialProfileAppearance } from '../profile';

// Profil enrichi avec stats publiques pour les listes de découverte.
// Hérite de SocialProfile (mêmes garanties de privacy) + 2 compteurs.
export type DiscoveredUser = SocialProfile & {
  follower_count: number;
  public_sheets_count: number;
};

type RpcRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_premium: boolean | null;
  appearance: SocialProfileAppearance | null;
  badge_keys: string[] | null;
  follower_count: number;
  public_sheets_count: number;
};

function mapRow(row: RpcRow): DiscoveredUser {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    is_premium: row.is_premium ?? false,
    appearance: row.appearance,
    badge_keys: row.badge_keys ?? [],
    follower_count: row.follower_count,
    public_sheets_count: row.public_sheets_count,
  };
}

export async function searchUsersByUsername(
  query: string,
  limit = 20,
): Promise<DiscoveredUser[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const { data, error } = await getClient().rpc('search_users_by_username', {
    p_query: trimmed,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as RpcRow[]).map(mapRow);
}

export async function recommendUsers(limit = 20): Promise<DiscoveredUser[]> {
  const { data, error } = await getClient().rpc('recommend_users', {
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as RpcRow[]).map(mapRow);
}
