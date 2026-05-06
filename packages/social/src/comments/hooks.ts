import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TargetRef, UserId } from '../types';
import {
  addComment,
  editComment,
  listReplies,
  listRootComments,
  softDeleteComment,
} from './api';
import type { Comment } from './types';

const KEYS = {
  root: (target: TargetRef) =>
    ['social', 'comments', 'root', target.kind, target.id] as const,
  replies: (parentId: string) =>
    ['social', 'comments', 'replies', parentId] as const,
};

export function useRootComments(target: TargetRef) {
  return useQuery<Comment[]>({
    queryKey: KEYS.root(target),
    queryFn: () => listRootComments(target),
    enabled: Boolean(target.kind && target.id),
    staleTime: 1000 * 30,
  });
}

// `enabled` exposé pour que la liste de réponses ne se déclenche QUE quand
// l'UI ouvre les replies (économie réseau).
export function useReplies(
  parentId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<Comment[]>({
    queryKey: KEYS.replies(parentId ?? ''),
    queryFn: () => listReplies(parentId!),
    enabled: Boolean(parentId) && (options?.enabled ?? true),
    staleTime: 1000 * 30,
  });
}

// Ajout de commentaire (root ou reply). On invalide la queryKey appropriée
// pour récupérer un commentaire enrichi (actor profile, counts) — l'optimisme
// se fait avec un placeholder minimal puis le re-fetch écrase.
export function useAddComment(
  target: TargetRef,
  currentUserId: UserId | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      body: string;
      parentId?: string | null;
    }) => {
      if (!currentUserId) throw new Error('Not authenticated');
      return addComment({
        currentUserId,
        target,
        body: params.body,
        parentId: params.parentId ?? null,
      });
    },
    onMutate: async ({ body, parentId = null }) => {
      // Optimistic : on ajoute un placeholder dans la bonne liste. L'enrich-
      // issement (actor.username/avatar/font) arrive au re-fetch déclenché
      // par onSettled.
      const placeholder: Comment = {
        id: `optimistic-${Date.now()}`,
        user_id: currentUserId ?? '',
        parent_id: parentId,
        body,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        actor: {
          id: currentUserId ?? '',
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
        is_editable: false,
      };

      if (parentId) {
        await qc.cancelQueries({ queryKey: KEYS.replies(parentId) });
        const previous = qc.getQueryData<Comment[]>(KEYS.replies(parentId));
        qc.setQueryData<Comment[]>(KEYS.replies(parentId), (old) => [
          ...(old ?? []),
          placeholder,
        ]);
        // Bump replies_count sur le root parent dans la liste root (UI affiche
        // "Voir les N réponses" tout de suite).
        qc.setQueryData<Comment[]>(KEYS.root(target), (old) =>
          old?.map((c) =>
            c.id === parentId
              ? { ...c, replies_count: c.replies_count + 1 }
              : c,
          ),
        );
        return { kind: 'reply' as const, parentId, previous };
      }

      await qc.cancelQueries({ queryKey: KEYS.root(target) });
      const previous = qc.getQueryData<Comment[]>(KEYS.root(target));
      qc.setQueryData<Comment[]>(KEYS.root(target), (old) => [
        ...(old ?? []),
        placeholder,
      ]);
      return { kind: 'root' as const, previous };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.kind === 'reply') {
        qc.setQueryData(KEYS.replies(ctx.parentId), ctx.previous);
      } else {
        qc.setQueryData(KEYS.root(target), ctx.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      // Re-fetch enrichi.
      if (vars.parentId) {
        qc.invalidateQueries({ queryKey: KEYS.replies(vars.parentId) });
      }
      qc.invalidateQueries({ queryKey: KEYS.root(target) });
    },
  });
}

export function useEditComment(target: TargetRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; body: string }) => {
      await editComment(params.id, params.body);
    },
    onSettled: () => {
      // Le commentaire édité peut être un root OU une reply. On invalide les
      // deux familles ; coût négligeable.
      qc.invalidateQueries({ queryKey: KEYS.root(target) });
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'social' &&
          q.queryKey[1] === 'comments' &&
          q.queryKey[2] === 'replies',
      });
    },
  });
}

export function useDeleteComment(target: TargetRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; parentId?: string | null }) => {
      await softDeleteComment(params.id);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.root(target) });
      if (vars.parentId) {
        qc.invalidateQueries({ queryKey: KEYS.replies(vars.parentId) });
      }
    },
  });
}
