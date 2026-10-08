import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type AuthState =
  | { kind: "loading" }
  | { kind: "logged_out" }
  | { kind: "not_admin" }
  | { kind: "admin" };

// État d'auth du backoffice : session Supabase + flag `profiles.is_admin`.
// Ré-évalué à chaque changement de session.
export function useAdminAuth(): [AuthState, () => Promise<void>] {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });

  async function resolveAuth() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setAuth({ kind: "logged_out" });
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", session.user.id)
      .maybeSingle();
    setAuth({ kind: profile?.is_admin ? "admin" : "not_admin" });
  }

  useEffect(() => {
    void resolveAuth();
    const sub = supabase.auth.onAuthStateChange(() => {
      void resolveAuth();
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  return [auth, resolveAuth];
}
