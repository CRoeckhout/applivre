import { useEffect, useMemo, useState } from 'react';
import { BingoPillForm } from '../components/bingo-pill-form';
import {
  BingoPillList,
  type BingoPillStatusFilter,
} from '../components/bingo-pill-list';
import { supabase } from '../lib/supabase';
import {
  BINGO_PILL_STATUSES,
  type BingoPillRow,
  type BingoPillStatus,
} from '../lib/types';

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
  // Optionnel — utilisé par App.tsx pour afficher le badge "Proposé" sur le
  // tab. Push uniquement quand le compteur change.
  onProposedCountChange?: (count: number) => void;
};

// Ordre admin : on remonte les statuts qui demandent une action (proposed
// d'abord, puis private avec decision_reason = "à re-arbitrer ?", etc.).
const STATUS_PRIORITY: Record<BingoPillStatus, number> = {
  proposed: 0,
  private: 2,
  public: 3,
  disabled: 4,
};

export function BingoPillsSection({
  itemId,
  onItemChange,
  onProposedCountChange,
}: Props) {
  const [pills, setPills] = useState<BingoPillRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BingoPillStatusFilter>('all');
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
    const rows = (data ?? []) as BingoPillRow[];
    // Tri admin : proposed first, puis par created_at desc (déjà fait par
    // postgres). Le secondary sort déjà appliqué côté SQL.
    rows.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.created_at < b.created_at ? 1 : -1;
    });
    setPills(rows);
  }

  const statusCounts = useMemo<Record<BingoPillStatus, number>>(() => {
    const acc: Record<BingoPillStatus, number> = {
      private: 0,
      proposed: 0,
      public: 0,
      disabled: 0,
    };
    for (const p of pills) acc[p.status]++;
    return acc;
  }, [pills]);

  // Push le count "proposed" vers le parent (App.tsx) à chaque changement.
  useEffect(() => {
    onProposedCountChange?.(statusCounts.proposed);
  }, [statusCounts.proposed, onProposedCountChange]);

  function onSaved(saved: BingoPillRow) {
    setPills((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      let next: BingoPillRow[];
      if (idx === -1) next = [saved, ...prev];
      else {
        next = prev.slice();
        next[idx] = saved;
      }
      next.sort((a, b) => {
        const pa = STATUS_PRIORITY[a.status] ?? 99;
        const pb = STATUS_PRIORITY[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        return a.created_at < b.created_at ? 1 : -1;
      });
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
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts}
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
        }}>
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
            className="muted">
            Sélectionne un défi à gauche ou crée-en un nouveau.
          </main>
        )}
      </div>
    </div>
  );
}

// Re-export pour types externes (App.tsx peut importer BINGO_PILL_STATUSES si
// besoin futur). On garde l'import unique côté section.
export { BINGO_PILL_STATUSES };
