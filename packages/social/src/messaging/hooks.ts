import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import { getClient } from '../client';
import type { UserId } from '../types';
import {
  ensureThread,
  listMessages,
  listMyMutuals,
  listThreads,
  markThreadRead,
  sendMessage,
} from './api';
import type { Message, Thread } from './types';

const STALE_MS = 1000 * 30;

const KEYS = {
  threads: ['social', 'messaging', 'threads'] as const,
  messages: (threadId: string) =>
    ['social', 'messaging', 'messages', threadId] as const,
};

// Inbox + Realtime sur INSERT/UPDATE de social_message_threads. On invalide la
// liste à chaque event — coût léger (un RPC list_my_threads), et la donnée
// dérivée (last_message, unread) est plus simple à lire d'un trait depuis
// la source de vérité que de la patcher localement.
export function useThreads(currentUserId: UserId | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery<Thread[]>({
    queryKey: KEYS.threads,
    queryFn: listThreads,
    enabled: Boolean(currentUserId),
    staleTime: STALE_MS,
  });

  useEffect(() => {
    if (!currentUserId) return;
    // Nom unique : Supabase Realtime cache les channels par topic. Si l'effect
    // est re-invoqué (StrictMode dev, navigation), réutiliser le même nom
    // renvoie l'instance déjà subscribed → .on() jette après subscribe().
    // Un suffixe aléatoire force une fresh channel à chaque mount.
    const channel = getClient()
      .channel(`messaging-threads-${currentUserId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'social_message_threads' },
        () => qc.invalidateQueries({ queryKey: KEYS.threads }),
      )
      // Un nouveau message insère ne touche pas la table threads directement —
      // c'est le trigger after_insert qui bumpe last_message_at. On invalide
      // donc aussi sur INSERT messages : la realtime de threads suffit en
      // général, mais double-bind pour minimiser la latence d'unread.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_messages' },
        () => qc.invalidateQueries({ queryKey: KEYS.threads }),
      )
      .subscribe();
    return () => {
      void getClient().removeChannel(channel);
    };
  }, [currentUserId, qc]);

  return query;
}

export function useUnreadTotal(currentUserId: UserId | null | undefined) {
  const threadsQuery = useThreads(currentUserId);
  return (threadsQuery.data ?? []).reduce((sum, t) => sum + t.unread_count, 0);
}

// Messages d'un thread. Realtime sur INSERT du thread courant — on append au
// cache. Pas de pagination infinie v1 : 50 derniers messages, suffisant
// largement pour une conv 1:1. À étendre si besoin.
export function useMessages(threadId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery<Message[]>({
    queryKey: KEYS.messages(threadId ?? ''),
    queryFn: () => listMessages({ threadId: threadId! }),
    enabled: Boolean(threadId),
    staleTime: STALE_MS,
  });

  useEffect(() => {
    if (!threadId) return;
    const channel = getClient()
      .channel(`messaging-thread-${threadId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const next = payload.new as Message;
          qc.setQueryData<Message[]>(KEYS.messages(threadId), (old) => {
            if (!old) return [next];
            // Dédoublonne (l'optimistic remplacement peut déjà avoir poussé l'id).
            if (old.some((m) => m.id === next.id)) return old;
            return [next, ...old];
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'social_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          qc.setQueryData<Message[]>(KEYS.messages(threadId), (old) =>
            old?.map((m) => (m.id === updated.id ? updated : m)),
          );
        },
      )
      .subscribe();
    return () => {
      void getClient().removeChannel(channel);
    };
  }, [threadId, qc]);

  return query;
}

export function useSendMessage(
  threadId: string | null | undefined,
  currentUserId: UserId | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!threadId || !currentUserId) throw new Error('Missing context');
      return sendMessage({ threadId, senderId: currentUserId, body });
    },
    onMutate: async (body) => {
      if (!threadId) return undefined;
      await qc.cancelQueries({ queryKey: KEYS.messages(threadId) });
      const previous = qc.getQueryData<Message[]>(KEYS.messages(threadId));
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        thread_id: threadId,
        sender_id: currentUserId ?? '',
        body,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<Message[]>(KEYS.messages(threadId), (old) =>
        old ? [optimistic, ...old] : [optimistic],
      );
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      if (!threadId || !ctx) return;
      qc.setQueryData(KEYS.messages(threadId), ctx.previous);
    },
    onSuccess: (data, _vars, ctx) => {
      if (!threadId || !ctx) return;
      // Remplace le placeholder optimistic par la vraie row (sans attendre
      // l'event realtime). Si la realtime arrive avant nous, le dédoublonnage
      // par id côté useMessages évite le doublon.
      qc.setQueryData<Message[]>(KEYS.messages(threadId), (old) =>
        old?.map((m) => (m.id === ctx.optimisticId ? data : m)),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.threads });
    },
  });
}

export function useEnsureThread() {
  return useMutation({
    mutationFn: async (otherUserId: UserId) => ensureThread(otherUserId),
  });
}

export function useMyMutuals(currentUserId: UserId | null | undefined) {
  return useQuery<UserId[]>({
    queryKey: ['social', 'messaging', 'mutuals', currentUserId ?? ''] as const,
    queryFn: () => listMyMutuals(currentUserId!),
    enabled: Boolean(currentUserId),
    staleTime: 1000 * 60,
  });
}

export function useMarkThreadRead(threadId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!threadId) return;
      await markThreadRead(threadId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.threads });
    },
  });
}
