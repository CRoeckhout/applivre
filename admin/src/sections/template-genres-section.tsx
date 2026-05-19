import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// CRUD basique des genres de templates de fiches. Liste figée éditable :
// l'app les fetch et les affiche en chips dans le drawer recherche et
// l'éditeur de template. Slugs immutables une fois créés (référencés par
// `reading_sheets_templates.genres[]`), label/ordre/actif éditables.
//
// Ordre : géré via drag-and-drop (cf. release-note-form pour le même
// pattern). Le champ sort_order n'est plus exposé en input — au drop on
// renormalise tous les sort_order en multiples de 10 et on UPDATE les
// rows dont l'ordre a effectivement changé.

type Row = {
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function TemplateGenresSection({ itemId: _itemId, onItemChange: _onItemChange }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftSlug, setDraftSlug] = useState('');
  const [draftLabel, setDraftLabel] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from('reading_sheets_template_genres')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  }

  async function createGenre() {
    const slug = draftSlug.trim().toLowerCase();
    const label = draftLabel.trim();
    if (!slug || !label) return;
    if (!/^[a-z0-9-]+$/.test(slug)) {
      alert('Le slug ne peut contenir que lettres minuscules, chiffres et tirets.');
      return;
    }
    const nextOrder = (rows[rows.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase
      .from('reading_sheets_template_genres')
      .insert({ slug, label, sort_order: nextOrder, is_active: true });
    if (error) {
      alert(`Erreur: ${error.message}`);
      return;
    }
    setDraftSlug('');
    setDraftLabel('');
    void load();
  }

  async function updateGenre(slug: string, patch: Partial<Row>) {
    const { error } = await supabase
      .from('reading_sheets_template_genres')
      .update(patch)
      .eq('slug', slug);
    if (error) {
      alert(`Erreur: ${error.message}`);
      return;
    }
    void load();
  }

  async function deleteGenre(slug: string) {
    if (!confirm(`Supprimer le genre "${slug}" ? Les templates qui le référencent garderont la valeur dans leur tableau mais ne matcheront plus en filtre.`)) return;
    const { error } = await supabase
      .from('reading_sheets_template_genres')
      .delete()
      .eq('slug', slug);
    if (error) {
      alert(`Erreur: ${error.message}`);
      return;
    }
    void load();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = rows.findIndex((r) => r.slug === active.id);
    const newIdx = rows.findIndex((r) => r.slug === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    // Recompose la liste localement puis renormalise les sort_order par
    // pas de 10 (10, 20, 30…) — laisse de la marge pour de futurs insert
    // entre deux sans tout réécrire.
    const reordered = rows.slice();
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    const renumbered = reordered.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));

    // Update optimiste local pour feedback immédiat.
    setRows(renumbered);

    // Push en DB uniquement les rows dont l'ordre a changé (économie de
    // round-trips quand le drag ne déplace qu'un élément vers un voisin).
    const toPush = renumbered.filter((r) => {
      const prev = rows.find((x) => x.slug === r.slug);
      return prev && prev.sort_order !== r.sort_order;
    });

    await Promise.all(
      toPush.map((r) =>
        supabase
          .from('reading_sheets_template_genres')
          .update({ sort_order: r.sort_order })
          .eq('slug', r.slug),
      ),
    );
    // Reload pour confirmer le state final (en cas d'erreur de push, ça revient
    // à la vérité DB).
    void load();
  }

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <h2 style={{ margin: 0, marginBottom: 4 }}>Genres de templates</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Liste affichée dans le drawer de recherche et l’éditeur de template côté app.
        Le slug est l’identifiant stable — ne le change pas après création (utilisé en
        référence dans <code>reading_sheets_templates.genres</code>). L’ordre se modifie
        par drag-and-drop sur la poignée à gauche de chaque ligne.
      </p>

      {loadError && (
        <div className="error" style={{ background: '#fee', padding: 12, marginBottom: 12, borderRadius: 6 }}>
          Erreur de chargement: {loadError}
        </div>
      )}

      <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--line)', borderRadius: 8 }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>Nouveau genre</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 200 }}>
            <label>Slug</label>
            <input
              placeholder="ex. fantasy"
              value={draftSlug}
              onChange={(e) => setDraftSlug(e.target.value)}
            />
          </div>
          <div className="field" style={{ minWidth: 240 }}>
            <label>Label affiché</label>
            <input
              placeholder="ex. Fantaisie"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={createGenre}>+ Ajouter</button>
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          border: '1px solid var(--line)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '32px 200px 1fr 80px 100px',
            gap: 12,
            padding: '8px 12px',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
            letterSpacing: 0.4,
          }}>
          <div />
          <div>Slug</div>
          <div>Label</div>
          <div style={{ textAlign: 'center' }}>Actif</div>
          <div />
        </div>

        {rows.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: 'center' }}>
            Aucun genre. Ajoute-en un avec le formulaire ci-dessus.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}>
            <SortableContext
              items={rows.map((r) => r.slug)}
              strategy={verticalListSortingStrategy}>
              {rows.map((r) => (
                <SortableGenreRow
                  key={r.slug}
                  row={r}
                  onUpdateLabel={(label) => updateGenre(r.slug, { label })}
                  onToggleActive={(is_active) => updateGenre(r.slug, { is_active })}
                  onDelete={() => deleteGenre(r.slug)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SortableGenreRow({
  row,
  onUpdateLabel,
  onToggleActive,
  onDelete,
}: {
  row: Row;
  onUpdateLabel: (next: string) => void;
  onToggleActive: (next: boolean) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.slug });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 200px 1fr 80px 100px',
        gap: 12,
        padding: '8px 12px',
        borderBottom: '1px solid var(--line)',
        background: isDragging ? 'var(--surface-2)' : 'var(--surface)',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
        alignItems: 'center',
      }}>
      <DragHandle attributes={attributes} listeners={listeners} />
      <div style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 13 }}>
        {row.slug}
      </div>
      <input
        className="input"
        defaultValue={row.label}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next && next !== row.label) onUpdateLabel(next);
        }}
      />
      <div style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={row.is_active}
          onChange={(e) => onToggleActive(e.target.checked)}
        />
      </div>
      <button className="btn btn-danger" onClick={onDelete}>
        Supprimer
      </button>
    </div>
  );
}

// Bouton drag : seul lui capture le pointer pour @dnd-kit (le reste de
// la row reste cliquable normalement). Réplique de DragHandle dans
// release-note-form — garder en sync si on touche au visuel.
function DragHandle({
  attributes,
  listeners,
}: {
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
}) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      style={{
        cursor: 'grab',
        background: 'transparent',
        border: 'none',
        padding: 4,
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--ink-muted)',
        touchAction: 'none',
      }}
      title="Glisser pour réordonner"
      aria-label="Glisser pour réordonner">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round">
        <circle cx="9" cy="6" r="1" />
        <circle cx="9" cy="12" r="1" />
        <circle cx="9" cy="18" r="1" />
        <circle cx="15" cy="6" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="15" cy="18" r="1" />
      </svg>
    </button>
  );
}
