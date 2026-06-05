import { useEffect, useState } from 'react';
import { EditorialCandidatesPanel } from '../components/editorial-candidates-panel';
import { EditorialForm } from '../components/editorial-form';
import { EditorialList } from '../components/editorial-list';
import { supabase } from '../lib/supabase';
import type { EditorialPostRow, EditorialSeed } from '../lib/types';

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function EditorialSection({ itemId, onItemChange }: Props) {
  const [posts, setPosts] = useState<EditorialPostRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [seed, setSeed] = useState<EditorialSeed | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from('editorial_posts')
      .select('*')
      .order('pinned', { ascending: false })
      .order('publish_at', { ascending: false });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setPosts((data ?? []) as EditorialPostRow[]);
  }

  function onSaved(saved: EditorialPostRow) {
    // Le tri dépend de pinned + publish_at ; on recharge pour rester cohérent.
    void load();
    setSeed(null);
    setShowCandidates(false);
    onItemChange(saved.id);
    setCreating(false);
  }

  function onDeleted(_id: string) {
    void load();
    setSeed(null);
    setShowCandidates(false);
    onItemChange(null);
    setCreating(false);
  }

  const selected = creating ? null : (posts.find((p) => p.id === itemId) ?? null);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <EditorialList
        posts={posts}
        selectedId={creating || showCandidates ? null : itemId}
        onSelect={(id) => {
          setShowCandidates(false);
          setSeed(null);
          onItemChange(id);
          setCreating(false);
        }}
        onNew={() => {
          setShowCandidates(false);
          setSeed(null);
          setCreating(true);
          onItemChange(null);
        }}
        onCandidates={() => {
          setShowCandidates(true);
          setSeed(null);
          setCreating(false);
          onItemChange(null);
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Load error: {loadError}
          </div>
        )}
        {showCandidates ? (
          <EditorialCandidatesPanel
            onPromote={(s) => {
              setSeed(s);
              setShowCandidates(false);
              setCreating(true);
              onItemChange(null);
            }}
          />
        ) : selected || creating ? (
          <EditorialForm
            initial={selected}
            seed={creating ? seed : null}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <main style={{ flex: 1, padding: 40, textAlign: 'center' }} className="muted">
            Sélectionne une publication à gauche ou crée-en une nouvelle.
          </main>
        )}
      </div>
    </div>
  );
}
