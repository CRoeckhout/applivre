import { useEffect, useState } from 'react';
import { BadgeForm } from './components/badge-form';
import { BadgeList } from './components/badge-list';
import { LoginForm } from './components/login';
import { supabase } from './lib/supabase';
import type { BadgeCatalogRow } from './lib/types';

type AuthState =
  | { kind: 'loading' }
  | { kind: 'logged_out' }
  | { kind: 'not_admin' }
  | { kind: 'admin' };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: 'loading' });
  const [badges, setBadges] = useState<BadgeCatalogRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'retired'>('all');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void resolveAuth();
    const sub = supabase.auth.onAuthStateChange(() => {
      void resolveAuth();
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  async function resolveAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setAuth({ kind: 'logged_out' });
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .maybeSingle();
    if (profile?.is_admin) {
      setAuth({ kind: 'admin' });
      void loadBadges();
    } else {
      setAuth({ kind: 'not_admin' });
    }
  }

  async function loadBadges() {
    setLoadError(null);
    const { data, error } = await supabase
      .from('badge_catalog')
      .select('*')
      .order('badge_key', { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setBadges((data ?? []) as BadgeCatalogRow[]);
  }

  function onSaved(saved: BadgeCatalogRow) {
    setBadges((prev) => {
      const idx = prev.findIndex((b) => b.badge_key === saved.badge_key);
      if (idx === -1) return [...prev, saved].sort((a, b) => a.badge_key.localeCompare(b.badge_key));
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    setSelectedKey(saved.badge_key);
    setCreating(false);
  }

  function onDeleted(key: string) {
    // "Retiré" = on garde la ligne avec retired_at non null.
    void loadBadges();
    setSelectedKey(key);
    setCreating(false);
  }

  if (auth.kind === 'loading') {
    return <div style={{ padding: 40 }}>Chargement…</div>;
  }
  if (auth.kind === 'logged_out') {
    return <LoginForm onLoggedIn={() => void resolveAuth()} />;
  }
  if (auth.kind === 'not_admin') {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', padding: 24, background: 'white', borderRadius: 12, border: '1px solid var(--line)' }}>
        <h1>Accès refusé</h1>
        <p>Ce compte n'a pas <code>profiles.is_admin = true</code>.</p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    );
  }

  const selected = creating ? null : badges.find((b) => b.badge_key === selectedKey) ?? null;

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <BadgeList
        badges={badges}
        selectedKey={creating ? null : selectedKey}
        filter={filter}
        onFilterChange={setFilter}
        onSelect={(k) => {
          setSelectedKey(k);
          setCreating(false);
        }}
        onNew={() => {
          setCreating(true);
          setSelectedKey(null);
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '12px 24px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white' }}>
          <strong>applivre — admin badges</strong>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </header>
        {loadError && <div className="error" style={{ padding: 12 }}>Load error: {loadError}</div>}
        {selected || creating ? (
          <BadgeForm initial={selected} onSaved={onSaved} onDeleted={onDeleted} />
        ) : (
          <main style={{ flex: 1, padding: 40, textAlign: 'center' }} className="muted">
            Sélectionne un badge à gauche ou crée-en un nouveau.
          </main>
        )}
      </div>
    </div>
  );
}
