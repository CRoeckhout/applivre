import { useQuery } from '@tanstack/react-query';
import { fetchEditorialFeed, fetchEditorialPost } from './api';

const STALE_MS = 1000 * 60;

export function useEditorialFeed() {
  return useQuery({
    queryKey: ['editorial', 'feed'],
    queryFn: () => fetchEditorialFeed(),
    staleTime: STALE_MS,
  });
}

export function useEditorialPost(id: string | null | undefined) {
  return useQuery({
    queryKey: ['editorial', 'post', id],
    queryFn: () => fetchEditorialPost(id!),
    enabled: Boolean(id),
    staleTime: STALE_MS,
  });
}
