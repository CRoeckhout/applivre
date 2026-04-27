import { supabase } from '@/lib/supabase';
import { useBadgeToasts } from '@/store/badge-toasts';
import { useBadges } from '@/store/badges';

// Wrapper sur l'RPC serveur `evaluate_user_badges()`.
// Le serveur calcule les badges débloqués depuis la DB et insère dans
// public.user_badges (trigger anti-triche actif). Retourne les nouvelles
// clés débloquées que l'on enqueue en toasts + merge dans le store local.
//
// Schedule = appel debouncé : chaque mutation pertinente appelle
// scheduleBadgeEval(). Une rafale de 50 écritures = 1 seul RPC après silence.

const DEBOUNCE_MS = 2000;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;

export function scheduleBadgeEval(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runBadgeEval();
  }, DEBOUNCE_MS);
}

export async function runBadgeEval(): Promise<void> {
  if (inflight) return;
  inflight = true;
  try {
    const { data, error } = await supabase.rpc('evaluate_user_badges');
    if (error) {
      console.warn('[badges] eval failed', error.message);
      return;
    }
    const newKeys = ((data ?? []) as unknown as string[]).filter(
      (k): k is string => typeof k === 'string' && k.length > 0,
    );
    if (newKeys.length === 0) return;

    const at = new Date().toISOString();
    useBadges.getState().merge(newKeys, at);
    useBadgeToasts.getState().enqueue(newKeys);
  } finally {
    inflight = false;
  }
}
