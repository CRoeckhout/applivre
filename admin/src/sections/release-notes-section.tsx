import { useEffect, useState } from 'react';
import { ReleaseNoteForm } from '../components/release-note-form';
import { ReleaseNoteList } from '../components/release-note-list';
import { supabase } from '../lib/supabase';
import type { ReleaseNoteRow } from '../lib/types';

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function ReleaseNotesSection({ itemId, onItemChange }: Props) {
  const [notes, setNotes] = useState<ReleaseNoteRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from('release_notes')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setNotes((data ?? []) as ReleaseNoteRow[]);
  }

  function onSaved(saved: ReleaseNoteRow) {
    setNotes((prev) => {
      const idx = prev.findIndex((n) => n.id === saved.id);
      if (idx === -1) {
        return [saved, ...prev].sort(
          (a, b) =>
            new Date(b.published_at).getTime() -
            new Date(a.published_at).getTime(),
        );
      }
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    onItemChange(saved.id);
    setCreating(false);
  }

  function onDeleted(_id: string) {
    void load();
    onItemChange(null);
    setCreating(false);
  }

  const selected = creating
    ? null
    : (notes.find((n) => n.id === itemId) ?? null);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <ReleaseNoteList
        notes={notes}
        selectedId={creating ? null : itemId}
        onSelect={(id) => {
          onItemChange(id);
          setCreating(false);
        }}
        onNew={() => {
          setCreating(true);
          onItemChange(null);
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Load error: {loadError}
          </div>
        )}
        {selected || creating ? (
          <ReleaseNoteForm
            initial={selected}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <main style={{ flex: 1, padding: 40, textAlign: 'center' }} className="muted">
            Sélectionne une note à gauche ou crée-en une nouvelle.
          </main>
        )}
      </div>
    </div>
  );
}
