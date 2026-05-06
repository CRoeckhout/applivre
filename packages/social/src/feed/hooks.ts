import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import {
  fetchFeed,
  getRepostSummary,
  repostEntry,
  unrepostEntry,
  type FeedEntry,
  type RepostSummary,
} from './api';

const PAGE_SIZE = 30;
const STALE_MS = 1000 * 30;

const repostSummaryKey = (entryId: string) =>
  ['social', 'feed', 'repost-summary', entryId] as const;

export function useRepostSummary(entryId: string | null | undefined) {
  return useQuery<RepostSummary>({
    queryKey: repostSummaryKey(entryId ?? ''),
    queryFn: () => getRepostSummary(entryId!),
    enabled: Boolean(entryId),
    staleTime: STALE_MS,
  });
}

// Toggle repost (avec quote optionnel). Logique :
//   - si already reposted (myRepostId !== null) → unrepost
//   - sinon → repost (avec note éventuelle)
//
// Optimistic : flippe le count + myRepostId. La synthèse côté SQL est
// idempotente, donc en cas d'échec on retombe sur la valeur réelle au
// onSettled.
export function useToggleRepost(entryId: string | null | undefined) {
  const qc = useQueryClient();
  const key = repostSummaryKey(entryId ?? '');

  return useMutation({
    mutationFn: async (vars: {
      currentlyReposted: boolean;
      note?: string | null;
    }) => {
      if (!entryId) throw new Error('Missing entry');
      if (vars.currentlyReposted) {
        await unrepostEntry(entryId);
        return null;
      }
      return repostEntry(entryId, vars.note ?? null);
    },
    onMutate: async (vars) => {
      if (!entryId) return undefined;
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RepostSummary>(key);
      const base: RepostSummary = previous ?? { count: 0, myRepostId: null };
      qc.setQueryData<RepostSummary>(key, {
        count: Math.max(0, base.count + (vars.currentlyReposted ? -1 : 1)),
        // Placeholder côté optimiste : un id non-vide pour highlight, le
        // vrai id arrive au onSettled.
        myRepostId: vars.currentlyReposted ? null : base.myRepostId ?? '__pending__',
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined)
        qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      // La timeline doit être rafraîchie : un repost apparaît / disparaît.
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
    },
  });
}

// Curseur = created_at de l'élément le plus ancien de la page précédente
// (exclusif). Si la page est plus courte que PAGE_SIZE, on est en bout de
// liste : pas de curseur suivant.
export function useFeed() {
  return useInfiniteQuery<
    FeedEntry[],
    Error,
    InfiniteData<FeedEntry[], string | null>,
    readonly ['social', 'feed'],
    string | null
  >({
    queryKey: ['social', 'feed'] as const,
    queryFn: ({ pageParam }) =>
      fetchFeed({ limit: PAGE_SIZE, before: pageParam }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const oldest = lastPage[lastPage.length - 1];
      return oldest?.created_at ?? undefined;
    },
    staleTime: STALE_MS,
  });
}
