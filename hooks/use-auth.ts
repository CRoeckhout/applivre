import AsyncStorageAdapter from '@/lib/supabase-storage';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

export type AuthState = {
  session: Session | null;
  loading: boolean;
};

// Clé sous laquelle supabase-js persiste la session. On reproduit la formule
// par défaut du client (`sb-<ref>-auth-token`, ref = 1er label du hostname) pour
// pouvoir relire la session SANS passer par getSession() — cf. readStoredSession.
const STORAGE_KEY = (() => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  try {
    const ref = new URL(url).hostname.split('.')[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
})();

// Lit la session persistée directement dans le storage, sans déclencher de
// refresh réseau. Indispensable hors ligne : getSession() tente un refresh quand
// l'access token est expiré et, hors ligne, ce fetch ne rejette pas vite — il
// pend jusqu'au timeout URLSession (~60s), gelant le loader. On contourne.
async function readStoredSession(): Promise<Session | null> {
  if (!STORAGE_KEY) return null;
  try {
    const raw = await AsyncStorageAdapter.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const candidate = parsed?.access_token ? parsed : parsed?.currentSession;
    return candidate?.access_token ? (candidate as Session) : null;
  } catch {
    return null;
  }
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Garde l'hydratation INITIALE au premier qui répond (getSession rapide ou
    // filet storage), pour ne pas écraser un résultat frais par un plus vieux.
    let initialized = false;
    const hydrateInitial = (s: Session | null) => {
      if (!mounted || initialized) return;
      initialized = true;
      setSession(s);
      setLoading(false);
    };

    // 1) Chemin rapide : instantané si le token n'est pas expiré (pas de réseau).
    supabase.auth
      .getSession()
      .then(({ data }) => hydrateInitial(data.session))
      .catch(() => {});

    // 2) Filet : si getSession traîne (refresh réseau qui pend hors ligne), on
    //    hydrate depuis le storage et on débloque l'app. La session lue sert au
    //    routage/affichage ; supabase rafraîchira en fond au retour du réseau.
    const fallback = setTimeout(() => {
      void readStoredSession().then(hydrateInitial);
    }, 1500);

    // 3) Autorité long terme : INITIAL_SESSION, refresh, sign-in/out. Met
    //    toujours la session à jour (corrige l'hydratation initiale au besoin).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      initialized = true;
      clearTimeout(fallback);
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(fallback);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

export async function requestEmailOtp(email: string) {
  const clean = email.trim().toLowerCase();
  return supabase.auth.signInWithOtp({
    email: clean,
    options: { shouldCreateUser: true },
  });
}

export async function verifyEmailOtp(email: string, token: string) {
  return supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}
