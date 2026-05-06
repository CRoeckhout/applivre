import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  recommendUsers,
  searchUsersByUsername,
  type DiscoveredUser,
} from './api';

const SEARCH_DEBOUNCE_MS = 250;
const STALE_MS = 1000 * 60;

// Debounce client-side : on attend 250ms après la dernière frappe avant de
// fire la requête. Évite les bursts de RPC sur un input live.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useSearchUsers(query: string) {
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  return useQuery<DiscoveredUser[]>({
    queryKey: ['social', 'discover', 'search', debounced],
    queryFn: () => searchUsersByUsername(debounced),
    enabled: debounced.length > 0,
    staleTime: STALE_MS,
  });
}

export function useRecommendedUsers(limit = 20) {
  return useQuery<DiscoveredUser[]>({
    queryKey: ['social', 'discover', 'recommend', limit],
    queryFn: () => recommendUsers(limit),
    staleTime: STALE_MS,
  });
}
