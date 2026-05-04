import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UserId } from '../types';
import {
  countFollowers,
  countFollowing,
  follow,
  isFollowing,
  listFollowers,
  listFollowing,
  unfollow,
} from './api';

const KEYS = {
  isFollowing: (current: UserId, target: UserId) =>
    ['social', 'follows', 'is', current, target] as const,
  followers: (userId: UserId) => ['social', 'follows', 'followers', userId] as const,
  following: (userId: UserId) => ['social', 'follows', 'following', userId] as const,
  countFollowers: (userId: UserId) =>
    ['social', 'follows', 'count', 'followers', userId] as const,
  countFollowing: (userId: UserId) =>
    ['social', 'follows', 'count', 'following', userId] as const,
};

export function useIsFollowing(
  currentUserId: UserId | null | undefined,
  targetUserId: UserId | null | undefined,
) {
  return useQuery({
    queryKey: KEYS.isFollowing(currentUserId ?? '', targetUserId ?? ''),
    queryFn: () => isFollowing(currentUserId!, targetUserId!),
    enabled: Boolean(currentUserId && targetUserId && currentUserId !== targetUserId),
  });
}

export function useFollowers(userId: UserId | null | undefined) {
  return useQuery({
    queryKey: KEYS.followers(userId ?? ''),
    queryFn: () => listFollowers(userId!),
    enabled: Boolean(userId),
  });
}

export function useFollowing(userId: UserId | null | undefined) {
  return useQuery({
    queryKey: KEYS.following(userId ?? ''),
    queryFn: () => listFollowing(userId!),
    enabled: Boolean(userId),
  });
}

export function useFollowerCount(userId: UserId | null | undefined) {
  return useQuery({
    queryKey: KEYS.countFollowers(userId ?? ''),
    queryFn: () => countFollowers(userId!),
    enabled: Boolean(userId),
  });
}

export function useFollowingCount(userId: UserId | null | undefined) {
  return useQuery({
    queryKey: KEYS.countFollowing(userId ?? ''),
    queryFn: () => countFollowing(userId!),
    enabled: Boolean(userId),
  });
}

export function useToggleFollow(currentUserId: UserId | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      targetUserId,
      next,
    }: {
      targetUserId: UserId;
      next: boolean;
    }) => {
      if (!currentUserId) throw new Error('Not authenticated');
      if (next) await follow(currentUserId, targetUserId);
      else await unfollow(currentUserId, targetUserId);
    },
    onSuccess: (_data, { targetUserId }) => {
      if (!currentUserId) return;
      qc.invalidateQueries({ queryKey: KEYS.isFollowing(currentUserId, targetUserId) });
      qc.invalidateQueries({ queryKey: KEYS.following(currentUserId) });
      qc.invalidateQueries({ queryKey: KEYS.countFollowing(currentUserId) });
      qc.invalidateQueries({ queryKey: KEYS.followers(targetUserId) });
      qc.invalidateQueries({ queryKey: KEYS.countFollowers(targetUserId) });
    },
  });
}
