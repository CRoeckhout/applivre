import { getClient } from '../client';
import type { SocialProfileAppearance } from '../profile';
import type { UserId } from '../types';
import type { Message, Thread, ThreadState } from './types';

type ThreadRpcRow = {
  thread_id: string;
  state: ThreadState;
  initiator_id: string;
  last_message_at: string | null;
  last_message_id: string | null;
  last_message_body: string | null;
  last_message_sender: string | null;
  unread_count: number;
  other_user_id: string;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_url: string | null;
  other_is_premium: boolean | null;
  other_appearance: SocialProfileAppearance | null;
  other_badge_keys: string[] | null;
};

function mapThread(row: ThreadRpcRow): Thread {
  return {
    id: row.thread_id,
    state: row.state,
    initiator_id: row.initiator_id,
    last_message_at: row.last_message_at,
    last_message:
      row.last_message_id && row.last_message_body && row.last_message_sender
        ? {
            id: row.last_message_id,
            body: row.last_message_body,
            sender_id: row.last_message_sender,
          }
        : null,
    unread_count: row.unread_count ?? 0,
    other: {
      id: row.other_user_id,
      username: row.other_username,
      display_name: row.other_display_name,
      avatar_url: row.other_avatar_url,
      is_premium: row.other_is_premium ?? false,
      appearance: row.other_appearance,
      badge_keys: row.other_badge_keys ?? [],
    },
  };
}

export async function listThreads(): Promise<Thread[]> {
  const { data, error } = await getClient().rpc('list_my_threads');
  if (error) throw error;
  return ((data ?? []) as ThreadRpcRow[]).map(mapThread);
}

// Mutuals = intersection des follows. On utilise la table social_follows
// directement plutôt qu'un RPC dédié : l'opération est petite (qq dizaines
// d'IDs en pratique) et reste cohérente avec le pattern follows existant.
// Le caller enrichit les IDs avec useProfiles si besoin.
export async function listMyMutuals(currentUserId: UserId): Promise<UserId[]> {
  const client = getClient();
  const [followingRes, followersRes] = await Promise.all([
    client
      .from('social_follows')
      .select('followed_id')
      .eq('follower_id', currentUserId),
    client
      .from('social_follows')
      .select('follower_id')
      .eq('followed_id', currentUserId),
  ]);
  if (followingRes.error) throw followingRes.error;
  if (followersRes.error) throw followersRes.error;
  const followers = new Set(
    (followersRes.data ?? []).map((r) => r.follower_id as string),
  );
  return (followingRes.data ?? [])
    .map((r) => r.followed_id as string)
    .filter((id) => followers.has(id));
}

export async function ensureThread(otherUserId: UserId): Promise<string> {
  const { data, error } = await getClient().rpc('ensure_thread', {
    p_other: otherUserId,
  });
  if (error) throw error;
  return data as string;
}

export async function markThreadRead(threadId: string): Promise<void> {
  const { error } = await getClient().rpc('mark_thread_read', {
    p_thread: threadId,
  });
  if (error) throw error;
}

// Pagination keyset par created_at (curseur exclusif). PAGE_SIZE = 50 messages,
// suffisant pour une conversation 1:1. Si bout de liste atteint (page < limit),
// le hook coupe la pagination.
export async function listMessages(params: {
  threadId: string;
  before?: string | null;
  limit?: number;
}): Promise<Message[]> {
  const { threadId, before = null, limit = 50 } = params;
  let query = getClient()
    .from('social_messages')
    .select('id, thread_id, sender_id, body, read_at, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(params: {
  threadId: string;
  senderId: UserId;
  body: string;
}): Promise<Message> {
  const { threadId, senderId, body } = params;
  const { data, error } = await getClient()
    .from('social_messages')
    .insert({ thread_id: threadId, sender_id: senderId, body })
    .select('id, thread_id, sender_id, body, read_at, created_at')
    .single();
  if (error) throw error;
  return data as Message;
}
