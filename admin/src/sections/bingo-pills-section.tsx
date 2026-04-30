import { useEffect, useState } from 'react';
import { BingoPillForm } from '../components/bingo-pill-form';
import { BingoPillList } from '../components/bingo-pill-list';
import { supabase } from '../lib/supabase';
import type { BingoPillRow } from '../lib/types';

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function BingoPillsSection({ itemId, onItemChange }: Props) {
  const [pills, setPills] = useState<BingoPillRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from('bingo_pills')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setPills((data ?? []) as BingoPillRow[]);
  }

  function onSaved(saved: BingoPillRow) {
    setPills((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    onItemChange(saved.id);
    setCreating(false);
  }

  function onDeleted(id: string) {
    setPills((prev) => prev.filter((p) => p.id !== id));
    onItemChange(null);
    setCreating(false);
  }

  async function onDeleteFromList(pill: BingoPillRow) {
    if (!window.confirm(`Supprimer « ${pill.label} » ?`)) return;
    setDeletingId(pill.id);
    setLoadError(null);
    const { error } = await supabase
      .from('bingo_pills')
      .delete()
      .eq('id', pill.id);
    setDeletingId(null);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setPills((prev) => prev.filter((p) => p.id !== pill.id));
    if (itemId === pill.id) {
      onItemChange(null);
      setCreating(false);
    }
  }

  const selected = creating
    ? null
    : (pills.find((p) => p.id === itemId) ?? null);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <BingoPillList
        pills={pills}
        selectedId={creating ? null : itemId}
        search={search}
        onSearchChange={setSearch}
        onSelect={(id) => {
          onItemChange(id);
          setCreating(false);
        }}
        onNew={() => {
          setCreating(true);
          onItemChange(null);
        }}
        onDelete={onDeleteFromList}
        deletingId={deletingId}
      />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Load error: {loadError}
          </div>
        )}
        {selected || creating ? (
          <BingoPillForm
            initial={selected}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <main
            style={{ flex: 1, padding: 40, textAlign: 'center' }}
            className="muted"
          >
            Sélectionne un défi à gauche ou crée-en un nouveau.
          </main>
        )}
      </div>
    </div>
  );
}
