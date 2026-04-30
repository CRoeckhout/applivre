import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BingoPillRow, UserCardData } from '../lib/types';
import { UserCard } from './user-card';

type Props = {
  initial: BingoPillRow | null;
  onSaved: (pill: BingoPillRow) => void;
  onDeleted: (id: string) => void;
};

export function BingoPillForm({ initial, onSaved, onDeleted }: Props) {
  const isCreate = initial === null;
  const [label, setLabel] = useState(initial?.label ?? '');
  const [userId, setUserId] = useState(initial?.user_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [user, setUser] = useState<UserCardData | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(initial?.label ?? '');
    setUserId(initial?.user_id ?? '');
    setError(null);
    setUser(null);
    setUserError(null);

    if (initial?.user_id) {
      void loadUser(initial.user_id);
    }

    async function loadUser(uid: string) {
      setUserLoading(true);
      const { data, error: e } = await supabase.rpc('admin_user_card', {
        p_user_id: uid,
      });
      setUserLoading(false);
      if (e) {
        setUserError(e.message);
        return;
      }
      const rows = (data ?? []) as UserCardData[];
      setUser(rows[0] ?? null);
    }
  }, [initial?.id]);

  async function onSave() {
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Label requis.');
      return;
    }
    if (isCreate && !userId.trim()) {
      setError('user_id requis pour créer un défi.');
      return;
    }
    setSaving(true);
    try {
      if (isCreate) {
        const { data, error: e } = await supabase
          .from('bingo_pills')
          .insert({ label: trimmed, user_id: userId.trim() })
          .select('*')
          .single();
        if (e) throw e;
        onSaved(data as BingoPillRow);
      } else {
        const { data, error: e } = await supabase
          .from('bingo_pills')
          .update({ label: trimmed })
          .eq('id', initial!.id)
          .select('*')
          .single();
        if (e) throw e;
        onSaved(data as BingoPillRow);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (!window.confirm(`Supprimer « ${initial.label} » ?`)) return;
    setSaving(true);
    setError(null);
    try {
      const { error: e } = await supabase
        .from('bingo_pills')
        .delete()
        .eq('id', initial.id);
      if (e) throw e;
      onDeleted(initial.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>
        {isCreate ? 'Nouveau défi bingo' : 'Éditer défi bingo'}
      </h2>

      {!isCreate && initial && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
          ID : <code>{initial.id}</code>
          <br />
          Créé le {new Date(initial.created_at).toLocaleString('fr-FR')}
        </div>
      )}

      {!isCreate && initial && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}
            className="muted"
          >
            Auteur
          </div>
          <UserCard
            user={user}
            loading={userLoading}
            error={userError}
            emptyLabel="Profil utilisateur introuvable."
          />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex : Livre avec un chat sur la couverture"
          style={{
            width: '100%',
            maxWidth: 480,
            padding: '8px 10px',
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            fontSize: 14,
          }}
        />
      </div>

      {isCreate && (
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            user_id
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="UUID auth.users.id"
            style={{
              width: '100%',
              maxWidth: 480,
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: 'var(--surface-2)',
              color: 'var(--ink)',
              fontSize: 13,
              fontFamily: 'monospace',
            }}
          />
        </div>
      )}

      {error && (
        <div className="error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? '…' : isCreate ? 'Créer' : 'Enregistrer'}
        </button>
        {!isCreate && (
          <button
            className="btn"
            onClick={onDelete}
            disabled={saving}
            style={{ marginLeft: 'auto', color: '#dc2626' }}
          >
            Supprimer
          </button>
        )}
      </div>
    </main>
  );
}
