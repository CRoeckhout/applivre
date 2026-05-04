import { getClient } from '../client';
import type { UserId } from '../types';

export type FollowEdge = {
  follower_id: UserId;
  followed_id: UserId;
  created_at: string;
};

export async function follow(currentUserId: UserId, targetUserId: UserId): Promise<void> {
  if (currentUserId === targetUserId) {
    throw new Error('Cannot follow yourself');
  }
  const { error } = await getClient()
    .from('social_follows')
    .insert({ follower_id: currentUserId, followed_id: targetUserId });
  if (error && error.code !== '23505') throw error;
}

export async function unfollow(currentUserId: UserId, targetUserId: UserId): Promise<void> {
  const { error } = await getClient()
    .from('social_follows')
    .delete()
    .eq('follower_id', currentUserId)
    .eq('followed_id', targetUserId);
  if (error) throw error;
}

export async function isFollowing(
  currentUserId: UserId,
  targetUserId: UserId,
): Promise<boolean> {
  const { data, error } = await getClient()
    .from('social_follows')
    .select('follower_id')
    .eq('follower_id', currentUserId)
    .eq('followed_id', targetUserId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listFollowers(userId: UserId): Promise<UserId[]> {
  const { data, error } = await getClient()
    .from('social_follows')
    .select('follower_id')
    .eq('followed_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => r.follower_id);
}

export async function listFollowing(userId: UserId): Promise<UserId[]> {
  const { data, error } = await getClient()
    .from('social_follows')
    .select('followed_id')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => r.followed_id);
}

export async function countFollowers(userId: UserId): Promise<number> {
  const { count, error } = await getClient()
    .from('social_follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('followed_id', userId);
  if (error) throw error;
  return count ?? 0;
}

export async function countFollowing(userId: UserId): Promise<number> {
  const { count, error } = await getClient()
    .from('social_follows')
    .select('followed_id', { count: 'exact', head: true })
    .eq('follower_id', userId);
  if (error) throw error;
  return count ?? 0;
}
