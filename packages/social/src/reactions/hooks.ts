import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TargetRef, UserId } from '../types';
import { addReaction, getReactionSummary, removeReaction } from './api';
import { EMPTY_SUMMARY, type ReactionSummary, type ReactionType } from './types';

const summaryKey = (target: TargetRef, currentUserId: UserId | null) =>
  ['social', 'reactions', 'summary', target.kind, target.id, currentUserId ?? null] as const;

export function useReactionSummary(
  target: TargetRef,
  currentUserId: UserId | null | undefined,
) {
  return useQuery<ReactionSummary>({
    queryKey: summaryKey(target, currentUserId ?? null),
    queryFn: () => getReactionSummary(currentUserId ?? null, target),
    enabled: Boolean(target.kind && target.id),
    staleTime: 1000 * 30,
  });
}

export function useToggleReaction(
  target: TargetRef,
  currentUserId: UserId | null | undefined,
) {
  const qc = useQueryClient();
  const key = summaryKey(target, currentUserId ?? null);

  return useMutation({
    mutationFn: async ({
      type,
      next,
    }: {
      type: ReactionType;
      next: boolean;
    }) => {
      if (!currentUserId) throw new Error('Not authenticated');
      if (next) await addReaction(currentUserId, target, type);
      else await removeReaction(currentUserId, target, type);
    },
    // Optimistic : on flippe localement le count + myReactions, on annule en
    // cas d'erreur. La latence du round-trip Supabase rend l'optimiste très
    // visible (le like se voit immédiatement).
    onMutate: async ({ type, next }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ReactionSummary>(key);
      const base = previous ?? EMPTY_SUMMARY;
      qc.setQueryData<ReactionSummary>(key, {
        counts: {
          ...base.counts,
          [type]: Math.max(0, base.counts[type] + (next ? 1 : -1)),
        },
        myReactions: { ...base.myReactions, [type]: next },
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
