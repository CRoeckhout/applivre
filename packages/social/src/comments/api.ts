import { getClient } from '../client';
import type { SocialProfileAppearance } from '../profile';
import type { TargetRef, UserId } from '../types';
import type { Comment } from './types';

type RootRpcRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  actor_is_premium: boolean | null;
  actor_appearance: SocialProfileAppearance | null;
  actor_badge_keys: string[] | null;
  replies_count: number;
  like_count: number;
  my_like: boolean;
  is_editable: boolean;
};

type ReplyRpcRow = Omit<RootRpcRow, 'replies_count'> & {
  parent_id: string;
};

function mapRootRow(row: RootRpcRow): Comment {
  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: null,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    actor: {
      id: row.user_id,
      username: row.actor_username,
      display_name: row.actor_display_name,
      avatar_url: row.actor_avatar_url,
      is_premium: row.actor_is_premium ?? false,
      appearance: row.actor_appearance,
      badge_keys: row.actor_badge_keys ?? [],
    },
    replies_count: row.replies_count,
    like_count: row.like_count,
    my_like: row.my_like,
    is_editable: row.is_editable,
  };
}

function mapReplyRow(row: ReplyRpcRow): Comment {
  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: row.parent_id,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    actor: {
      id: row.user_id,
      username: row.actor_username,
      display_name: row.actor_display_name,
      avatar_url: row.actor_avatar_url,
      is_premium: row.actor_is_premium ?? false,
      appearance: row.actor_appearance,
      badge_keys: row.actor_badge_keys ?? [],
    },
    // Replies n'ont pas elles-mêmes de réponses (threading 1 niveau).
    replies_count: 0,
    like_count: row.like_count,
    my_like: row.my_like,
    is_editable: row.is_editable,
  };
}

export async function listRootComments(target: TargetRef): Promise<Comment[]> {
  const { data, error } = await getClient().rpc('list_root_comments', {
    p_target_kind: target.kind,
    p_target_id: target.id,
  });
  if (error) throw error;
  return ((data ?? []) as RootRpcRow[]).map(mapRootRow);
}

export async function listReplies(parentId: string): Promise<Comment[]> {
  const { data, error } = await getClient().rpc('list_comment_replies', {
    p_parent_id: parentId,
  });
  if (error) throw error;
  return ((data ?? []) as ReplyRpcRow[]).map(mapReplyRow);
}

export async function addComment(params: {
  currentUserId: UserId;
  target: TargetRef;
  body: string;
  parentId?: string | null;
}): Promise<Comment> {
  const { currentUserId, target, body, parentId = null } = params;
  const { data, error } = await getClient()
    .from('social_comments')
    .insert({
      user_id: currentUserId,
      target_kind: target.kind,
      target_id: target.id,
      body,
      parent_id: parentId,
    })
    .select('id, body, created_at, edited_at, deleted_at, parent_id')
    .single();
  if (error) throw error;
  // L'insert renvoie peu de colonnes (pas l'enrichissement actor) — l'appelant
  // peut soit invalider la liste pour re-fetch enrichi, soit synthétiser un
  // optimistic local. Mock minimal des champs comptés (0 replies, 0 like).
  const row = data as {
    id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    parent_id: string | null;
  };
  return {
    id: row.id,
    user_id: currentUserId,
    parent_id: row.parent_id,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    actor: {
      id: currentUserId,
      username: null,
      display_name: null,
      avatar_url: null,
      is_premium: null,
      appearance: null,
      badge_keys: [],
    },
    replies_count: 0,
    like_count: 0,
    my_like: false,
    // Tout juste créé, sans interactions → editable.
    is_editable: true,
  };
}

export async function editComment(id: string, body: string): Promise<void> {
  const { error } = await getClient()
    .from('social_comments')
    .update({ body, edited_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Soft-delete : on conserve la ligne pour préserver le thread si elle a des
// réponses. L'UI affiche "[supprimé]" si replies_count > 0, sinon filtre.
export async function softDeleteComment(id: string): Promise<void> {
  const { error } = await getClient()
    .from('social_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
