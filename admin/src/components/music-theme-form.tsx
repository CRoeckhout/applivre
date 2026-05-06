import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { MusicThemeRow } from '../lib/types';

type Props = {
  initial: MusicThemeRow | null;
  onSaved: (saved: MusicThemeRow) => void;
  onDeleted: (id: string) => void;
};

export function MusicThemeForm({ initial, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  const [key, setKey] = useState(initial?.key ?? '');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [sortOrder, setSortOrder] = useState<string>(
    initial ? String(initial.sort_order) : '0',
  );
  const [isActive, setIsActive] = useState<boolean>(initial?.is_active ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setKey(initial?.key ?? '');
    setDisplayName(initial?.display_name ?? '');
    setSortOrder(initial ? String(initial.sort_order) : '0');
    setIsActive(initial?.is_active ?? true);
    setError(null);
    setSuccess(null);
  }, [initial]);

  async function save() {
    setError(null);
    setSuccess(null);

    if (!key || !displayName) {
      setError('key et nom requis');
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(key)) {
      setError('key doit être en minuscules (a-z, 0-9, _, -)');
      return;
    }
    const so = Number.parseInt(sortOrder, 10);
    if (!Number.isFinite(so)) {
      setError('sort_order doit être un entier');
      return;
    }

    setSubmitting(true);
    try {
      const row = {
        ...(initial ? { id: initial.id } : {}),
        key,
        display_name: displayName,
        sort_order: so,
        is_active: isActive,
      };
      const query = initial
        ? supabase
            .from('music_themes')
            .update(row)
            .eq('id', initial.id)
            .select()
            .single()
        : supabase.from('music_themes').insert(row).select().single();
      const { data, error: upErr } = await query;
      if (upErr) {
        setError(`Save échec : ${upErr.message}`);
        return;
      }
      setSuccess('Enregistré.');
      onSaved(data as MusicThemeRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (
      !confirm(
        `Supprimer le thème "${initial.display_name}" ? Les pistes associées seront aussi supprimées (cascade).`,
      )
    )
      return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('music_themes')
      .delete()
      .eq('id', initial.id);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted(initial.id);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>
        {isNew ? 'Nouveau thème' : initial.display_name}
      </h2>

      <div className="field">
        <label>key</label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={!isNew}
          placeholder="ex: horror"
        />
        {!isNew && (
          <div className="muted" style={{ fontSize: 12 }}>
            Non modifiable après création.
          </div>
        )}
      </div>

      <div className="field">
        <label>Nom affiché</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="ex: Horreur"
        />
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>sort_order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingBottom: 8,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Actif</span>
        </label>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save} disabled={submitting}>
          {submitting ? 'Enregistrement…' : isNew ? 'Créer' : 'Enregistrer'}
        </button>
        {!isNew && (
          <button className="btn btn-danger" onClick={remove} disabled={submitting}>
            Supprimer
          </button>
        )}
      </div>
    </div>
  );
}
