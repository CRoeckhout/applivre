import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

export type AuthState = {
  session: Session | null;
  loading: boolean;
};

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
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
