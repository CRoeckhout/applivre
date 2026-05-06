import { getClient } from '../client';
import type { SocialProfile, SocialProfileAppearance } from '../profile';
import type { UserId } from '../types';

// Source du tri pour le ranking. 'self' = tes propres événements (priorité
// max), 'followee' = events des users que tu suis, 'discovery' = pool reco
// public — utilisé pour remplir le feed quand le pool followees est vide.
export type FeedEntrySource = 'self' | 'followee' | 'discovery';

export type FeedEntry = {
  id: string;
  actor_id: UserId;
  // Profil snapshot inline pour éviter un round-trip — la lentille profile
  // reste utilisable indépendamment.
  actor: SocialProfile;
  verb: string;
  target_kind: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  source: FeedEntrySource;
  score: number;
};

type RpcRow = {
  entry_id: string;
  actor_id: string;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  actor_is_premium: boolean | null;
  actor_appearance: SocialProfileAppearance | null;
  actor_badge_keys: string[] | null;
  verb: string;
  target_kind: string | null;
  target_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  source: FeedEntrySource;
  score: number;
};

function mapRow(row: RpcRow): FeedEntry {
  return {
    id: row.entry_id,
    actor_id: row.actor_id,
    actor: {
      id: row.actor_id,
      username: row.actor_username,
      display_name: row.actor_display_name,
      avatar_url: row.actor_avatar_url,
      is_premium: row.actor_is_premium ?? false,
      appearance: row.actor_appearance,
      badge_keys: row.actor_badge_keys ?? [],
    },
    verb: row.verb,
    target_kind: row.target_kind,
    target_id: row.target_id,
    meta: row.meta ?? {},
    created_at: row.created_at,
    source: row.source,
    score: row.score,
  };
}

export async function fetchFeed(params: {
  limit?: number;
  before?: string | null;
}): Promise<FeedEntry[]> {
  const { limit = 30, before = null } = params;
  const { data, error } = await getClient().rpc('get_feed', {
    p_limit: limit,
    p_before: before,
  });
  if (error) throw error;
  return ((data ?? []) as RpcRow[]).map(mapRow);
}

// Lookup d'une seule entry. Pour l'écran dédié /feed/[entryId]. La fonction
// SQL `get_feed_entry` ne renvoie PAS source/score (sans rang dans ce
// contexte) — on synthétise des valeurs neutres pour rester compatible avec
// le type FeedEntry.
type DetailRpcRow = Omit<RpcRow, 'source' | 'score'>;

export async function fetchFeedEntry(
  entryId: string,
): Promise<FeedEntry | null> {
  const { data, error } = await getClient().rpc('get_feed_entry', {
    p_entry_id: entryId,
  });
  if (error) throw error;
  const row = ((data ?? [])[0] as DetailRpcRow | undefined) ?? null;
  if (!row) return null;
  return mapRow({ ...row, source: 'discovery', score: 0 });
}

// Repost / quote-repost — cf. migration 0055.
//
// repostEntry : republie une entry source dans le feed du caller.
// Idempotent côté SQL (re-call sur la même source = no-op qui renvoie l'id
// existant). `note` (optionnel) → quote-repost.
export async function repostEntry(
  entryId: string,
  note?: string | null,
): Promise<string> {
  const { data, error } = await getClient().rpc('repost_feed_entry', {
    p_entry_id: entryId,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function unrepostEntry(entryId: string): Promise<void> {
  const { error } = await getClient().rpc('unrepost_feed_entry', {
    p_entry_id: entryId,
  });
  if (error) throw error;
}

export type RepostSummary = {
  count: number;
  // null si l'user courant n'a pas reposté cette entry — sinon l'id de sa
  // propre row repost (utilisé pour highlight le bouton + permettre le
  // toggle off).
  myRepostId: string | null;
};

export async function getRepostSummary(entryId: string): Promise<RepostSummary> {
  const { data, error } = await getClient().rpc('get_feed_repost_summary', {
    p_entry_id: entryId,
  });
  if (error) throw error;
  const row =
    ((data ?? [])[0] as { count: number; my_repost_id: string | null } | undefined) ??
    null;
  return {
    count: row?.count ?? 0,
    myRepostId: row?.my_repost_id ?? null,
  };
}
