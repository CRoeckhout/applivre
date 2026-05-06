import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UserId } from '../types';
import {
  deleteReview,
  fetchBookReviews,
  getMyReview,
  getMyVote,
  publishReviewToFeed,
  unvoteReview,
  upsertReview,
  voteReview,
  type UpsertReviewInput,
} from './api';
import type { BookReviewsPayload, ReviewVoteValue } from './types';

const STALE_MS = 1000 * 30;

const reviewsKey = (bookIsbn: string) =>
  ['social', 'reviews', 'book', bookIsbn] as const;
const myReviewKey = (currentUserId: UserId | null, bookIsbn: string) =>
  ['social', 'reviews', 'mine', currentUserId ?? '', bookIsbn] as const;
const myVoteKey = (currentUserId: UserId | null, reviewId: string) =>
  ['social', 'reviews', 'vote', currentUserId ?? '', reviewId] as const;

export function useBookReviews(bookIsbn: string | null | undefined) {
  return useQuery<BookReviewsPayload>({
    queryKey: reviewsKey(bookIsbn ?? ''),
    queryFn: () => fetchBookReviews(bookIsbn!),
    enabled: Boolean(bookIsbn),
    staleTime: STALE_MS,
  });
}

export function useMyReview(
  currentUserId: UserId | null | undefined,
  bookIsbn: string | null | undefined,
) {
  return useQuery({
    queryKey: myReviewKey(currentUserId ?? null, bookIsbn ?? ''),
    queryFn: () => getMyReview(currentUserId!, bookIsbn!),
    enabled: Boolean(currentUserId && bookIsbn),
    staleTime: STALE_MS,
  });
}

// Crée / met à jour l'avis. Le résultat porte `created: true` à la
// première insertion — l'UI s'en sert pour décider d'afficher ou non la
// modale "Partagez votre avis !" (one-shot, jamais rejouée).
export function useUpsertReview(
  currentUserId: UserId | null | undefined,
  bookIsbn: string | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<UpsertReviewInput, 'bookIsbn'>) => {
      if (!currentUserId) throw new Error('Not authenticated');
      if (!bookIsbn) throw new Error('Missing book');
      return upsertReview(currentUserId, { ...input, bookIsbn });
    },
    onSuccess: () => {
      if (bookIsbn) {
        qc.invalidateQueries({ queryKey: reviewsKey(bookIsbn) });
        qc.invalidateQueries({
          queryKey: myReviewKey(currentUserId ?? null, bookIsbn),
        });
      }
    },
  });
}

export function useDeleteReview(
  currentUserId: UserId | null | undefined,
  bookIsbn: string | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      if (!currentUserId) throw new Error('Not authenticated');
      await deleteReview(reviewId);
    },
    onSuccess: () => {
      if (bookIsbn) {
        qc.invalidateQueries({ queryKey: reviewsKey(bookIsbn) });
        qc.invalidateQueries({
          queryKey: myReviewKey(currentUserId ?? null, bookIsbn),
        });
      }
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
    },
  });
}

// Publication au feed. Idempotente côté SQL — l'UI peut l'appeler sans
// craindre les doublons.
export function usePublishReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { reviewId: string; postText?: string | null }) =>
      publishReviewToFeed(vars.reviewId, vars.postText ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
    },
  });
}

export function useMyReviewVote(
  currentUserId: UserId | null | undefined,
  reviewId: string | null | undefined,
) {
  return useQuery<ReviewVoteValue | null>({
    queryKey: myVoteKey(currentUserId ?? null, reviewId ?? ''),
    queryFn: () => getMyVote(currentUserId!, reviewId!),
    enabled: Boolean(currentUserId && reviewId),
    staleTime: STALE_MS,
  });
}

// Vote up/down avec optimistic update sur le score affiché. La mutation
// flippe localement le score dans le cache de useBookReviews, et annule
// en cas d'erreur.
export function useVoteReview(
  currentUserId: UserId | null | undefined,
  bookIsbn: string | null | undefined,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      reviewId: string;
      next: ReviewVoteValue | null;
    }) => {
      if (!currentUserId) throw new Error('Not authenticated');
      if (vars.next === null) {
        await unvoteReview(vars.reviewId);
      } else {
        await voteReview(vars.reviewId, vars.next);
      }
    },
    onMutate: async (vars) => {
      if (!bookIsbn) return undefined;
      const listKey = reviewsKey(bookIsbn);
      const voteKeyTuple = myVoteKey(currentUserId ?? null, vars.reviewId);

      await Promise.all([
        qc.cancelQueries({ queryKey: listKey }),
        qc.cancelQueries({ queryKey: voteKeyTuple }),
      ]);

      const previousList = qc.getQueryData<BookReviewsPayload>(listKey);
      const previousVote =
        qc.getQueryData<ReviewVoteValue | null>(voteKeyTuple) ?? null;

      // Delta = nouveau - ancien (chacun ∈ {-1, 0, 1}).
      const delta = (vars.next ?? 0) - (previousVote ?? 0);

      if (previousList && delta !== 0) {
        qc.setQueryData<BookReviewsPayload>(listKey, {
          ...previousList,
          reviews: previousList.reviews.map((r) =>
            r.id === vars.reviewId ? { ...r, score: r.score + delta } : r,
          ),
        });
      }
      qc.setQueryData<ReviewVoteValue | null>(voteKeyTuple, vars.next);

      return { previousList, previousVote, listKey, voteKeyTuple };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.previousList)
        qc.setQueryData(ctx.listKey, ctx.previousList);
      qc.setQueryData(ctx.voteKeyTuple, ctx.previousVote);
    },
    onSettled: (_data, _err, vars) => {
      if (bookIsbn) qc.invalidateQueries({ queryKey: reviewsKey(bookIsbn) });
      qc.invalidateQueries({
        queryKey: myVoteKey(currentUserId ?? null, vars.reviewId),
      });
    },
  });
}
