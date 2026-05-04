import { getClient } from '../client';
import type { TargetRef, UserId } from '../types';
import {
  EMPTY_SUMMARY,
  REACTION_TYPES,
  type ReactionSummary,
  type ReactionType,
} from './types';

export async function addReaction(
  currentUserId: UserId,
  target: TargetRef,
  type: ReactionType,
): Promise<void> {
  const { error } = await getClient()
    .from('social_reactions')
    .insert({
      user_id: currentUserId,
      target_kind: target.kind,
      target_id: target.id,
      type,
    });
  // 23505 = unique violation : la réaction existe déjà, on traite comme idempotent.
  if (error && error.code !== '23505') throw error;
}

export async function removeReaction(
  currentUserId: UserId,
  target: TargetRef,
  type: ReactionType,
): Promise<void> {
  const { error } = await getClient()
    .from('social_reactions')
    .delete()
    .eq('user_id', currentUserId)
    .eq('target_kind', target.kind)
    .eq('target_id', target.id)
    .eq('type', type);
  if (error) throw error;
}

// Bundle: toutes les réactions sur la cible (pour les counts) + mes réactions
// (pour highlight). 2 round-trips parallélisés. À optimiser côté DB plus
// tard (vue agrégée ou RPC) si la cible a beaucoup de réactions.
export async function getReactionSummary(
  currentUserId: UserId | null,
  target: TargetRef,
): Promise<ReactionSummary> {
  const client = getClient();
  const allP = client
    .from('social_reactions')
    .select('type', { count: 'exact' })
    .eq('target_kind', target.kind)
    .eq('target_id', target.id);

  const minePromise = currentUserId
    ? client
        .from('social_reactions')
        .select('type')
        .eq('user_id', currentUserId)
        .eq('target_kind', target.kind)
        .eq('target_id', target.id)
    : Promise.resolve({ data: [] as { type: ReactionType }[], error: null });

  const [allRes, mineRes] = await Promise.all([allP, minePromise]);

  if (allRes.error) throw allRes.error;
  if ('error' in mineRes && mineRes.error) throw mineRes.error;

  const counts = { ...EMPTY_SUMMARY.counts };
  for (const row of (allRes.data ?? []) as { type: ReactionType }[]) {
    if (REACTION_TYPES.includes(row.type)) counts[row.type] += 1;
  }

  const myReactions = { ...EMPTY_SUMMARY.myReactions };
  for (const row of (mineRes.data ?? []) as { type: ReactionType }[]) {
    if (REACTION_TYPES.includes(row.type)) myReactions[row.type] = true;
  }

  return { counts, myReactions };
}
