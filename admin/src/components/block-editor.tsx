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
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  RELEASE_NOTE_BLOCK_LABELS,
  RELEASE_NOTE_BLOCK_TYPES,
  type ReleaseNoteBlock,
} from '../lib/types';
import { RichTextInput } from './rich-text-input';

// Éditeur de blocs partagé par les contenus à body JSONB (release notes,
// fil d'actualité). Schéma de blocs : title/text/list/table/image — rendu
// côté app par components/release-notes/block-renderer.tsx.
//
// Composant non contrôlé : il possède l'état des blocs (initialisé depuis
// `initialBlocks`) et remonte chaque mutation via `onChange` (blocs purs,
// sans les ids éphémères). Le parent force un reset en changeant la `key`
// (typiquement l'id de l'item édité). Le bucket d'upload images est
// paramétrable pour rester réutilisable entre features.

// IDs éphémères pour le drag-and-drop (jamais persistés en DB). On wrap
// chaque bloc et chaque item de liste dans `{ id, value }` côté state pour
// donner à @dnd-kit un identifiant stable qui ne dépend pas de la position.
function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

type Props = {
  initialBlocks: ReleaseNoteBlock[];
  onChange: (blocks: ReleaseNoteBlock[]) => void;
  assetsBucket: string;
};

export function BlockEditor({ initialBlocks, onChange, assetsBucket }: Props) {
  const [blocks, setBlocks] = useState<{ id: string; block: ReleaseNoteBlock }[]>(
    () => initialBlocks.map((b) => ({ id: makeId(), block: b })),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function commit(next: { id: string; block: ReleaseNoteBlock }[]) {
    setBlocks(next);
    onChange(next.map((it) => it.block));
  }

  function addBlock(type: ReleaseNoteBlock['type']) {
    commit([...blocks, { id: makeId(), block: makeEmptyBlock(type) }]);
  }

  function updateBlock(idx: number, next: ReleaseNoteBlock) {
    commit(blocks.map((it, i) => (i === idx ? { ...it, block: next } : it)));
  }

  function removeBlock(idx: number) {
    commit(blocks.filter((_, i) => i !== idx));
  }

  function moveBlock(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = blocks.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  }

  function handleBlockDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((it) => it.id === active.id);
    const newIdx = blocks.findIndex((it) => it.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = blocks.slice();
    const [moved] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, moved);
    commit(next);
  }

  return (
    <fieldset
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
      }}>
      <legend
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ink-muted)',
          textTransform: 'uppercase',
          padding: '0 6px',
        }}>
        Contenu (blocs)
      </legend>

      {blocks.length === 0 && (
        <div
          className="muted"
          style={{ padding: 12, textAlign: 'center', fontSize: 13 }}>
          Aucun bloc. Utilise le menu ci-dessous pour en ajouter.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleBlockDragEnd}>
        <SortableContext
          items={blocks.map((it) => it.id)}
          strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {blocks.map((it, idx) => (
              <SortableBlockEditor
                key={it.id}
                id={it.id}
                block={it.block}
                isFirst={idx === 0}
                isLast={idx === blocks.length - 1}
                assetsBucket={assetsBucket}
                onChange={(next) => updateBlock(idx, next)}
                onRemove={() => removeBlock(idx)}
                onMoveUp={() => moveBlock(idx, -1)}
                onMoveDown={() => moveBlock(idx, 1)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Ajouter un bloc :
        </span>
        {RELEASE_NOTE_BLOCK_TYPES.map((t) => (
          <button key={t} type="button" className="btn" onClick={() => addBlock(t)}>
            + {RELEASE_NOTE_BLOCK_LABELS[t]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// ═══════════════ SortableBlockEditor ═══════════════

type BlockEditorProps = {
  id: string;
  block: ReleaseNoteBlock;
  isFirst: boolean;
  isLast: boolean;
  assetsBucket: string;
  onChange: (next: ReleaseNoteBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

function SortableBlockEditor({
  id,
  block,
  isFirst,
  isLast,
  assetsBucket,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: BlockEditorProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--surface-2)',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DragHandle attributes={attributes} listeners={listeners} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
              letterSpacing: 0.4,
            }}>
            {RELEASE_NOTE_BLOCK_LABELS[block.type]}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="btn"
            disabled={isFirst}
            onClick={onMoveUp}
            title="Monter">
            ↑
          </button>
          <button
            type="button"
            className="btn"
            disabled={isLast}
            onClick={onMoveDown}
            title="Descendre">
            ↓
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onRemove}
            title="Supprimer ce bloc">
            ×
          </button>
        </div>
      </div>

      {block.type === 'title' && (
        <RichTextInput
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          placeholder="Titre du bloc"
        />
      )}

      {block.type === 'text' && (
        <RichTextInput
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          placeholder="Paragraphe"
          multiline
          withHeadings
        />
      )}

      {block.type === 'quote' && (
        <RichTextInput
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          placeholder="Citation"
          multiline
        />
      )}

      {block.type === 'list' && (
        <ListBlockEditor block={block} onChange={onChange} />
      )}

      {block.type === 'table' && (
        <TableBlockEditor block={block} onChange={onChange} />
      )}

      {block.type === 'image' && (
        <ImageBlockEditor block={block} assetsBucket={assetsBucket} onChange={onChange} />
      )}
    </div>
  );
}

function ListBlockEditor({
  block,
  onChange,
}: {
  block: Extract<ReleaseNoteBlock, { type: 'list' }>;
  onChange: (next: ReleaseNoteBlock) => void;
}) {
  // Source de vérité locale : on wrap chaque item dans `{ id, value }` pour
  // fournir un ID stable à @dnd-kit. Le remount via la key parente (id du
  // bloc) garantit le reset à chaque changement d'item ; pas de resync ici.
  const [items, setItems] = useState<{ id: string; value: string }[]>(() =>
    block.items.map((v) => ({ id: makeId(), value: v })),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function commit(next: { id: string; value: string }[]) {
    setItems(next);
    onChange({ ...block, items: next.map((i) => i.value) });
  }

  function setValue(idx: number, value: string) {
    commit(items.map((it, i) => (i === idx ? { ...it, value } : it)));
  }

  function removeItem(idx: number) {
    commit(items.filter((_, i) => i !== idx));
  }

  function moveItem(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  }

  function addItem() {
    commit([...items, { id: makeId(), value: '' }]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((it) => it.id === active.id);
    const newIdx = items.findIndex((it) => it.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = items.slice();
    const [moved] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, moved);
    commit(next);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}>
      <SortableContext
        items={items.map((it) => it.id)}
        strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it, idx) => (
            <SortableListItem
              key={it.id}
              id={it.id}
              value={it.value}
              index={idx}
              isFirst={idx === 0}
              isLast={idx === items.length - 1}
              onChange={(v) => setValue(idx, v)}
              onRemove={() => removeItem(idx)}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
            />
          ))}
          <button type="button" className="btn" onClick={addItem}>
            + Ajouter
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableListItem({
  id,
  value,
  index,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  id: string;
  value: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (v: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}>
      <DragHandle attributes={attributes} listeners={listeners} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <RichTextInput
          value={value}
          onChange={onChange}
          placeholder={`Item ${index + 1}`}
        />
      </div>
      <button
        type="button"
        className="btn"
        disabled={isFirst}
        onClick={onMoveUp}
        title="Monter">
        ↑
      </button>
      <button
        type="button"
        className="btn"
        disabled={isLast}
        onClick={onMoveDown}
        title="Descendre">
        ↓
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={onRemove}
        title="Supprimer">
        ×
      </button>
    </div>
  );
}

// Bouton réutilisable qui sert de poignée de drag. Reçoit les `attributes` +
// `listeners` de @dnd-kit/sortable : le drag ne s'active que quand
// l'utilisateur saisit ce bouton spécifiquement (input, ↑↓, × restent
// cliquables normalement).
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

function TableBlockEditor({
  block,
  onChange,
}: {
  block: Extract<ReleaseNoteBlock, { type: 'table' }>;
  onChange: (next: ReleaseNoteBlock) => void;
}) {
  const colCount = block.headers.length;

  function setHeader(colIdx: number, value: string) {
    const headers = block.headers.slice();
    headers[colIdx] = value;
    onChange({ ...block, headers });
  }

  function setCell(rowIdx: number, colIdx: number, value: string) {
    const rows = block.rows.map((r) => r.slice());
    rows[rowIdx][colIdx] = value;
    onChange({ ...block, rows });
  }

  function addRow() {
    onChange({ ...block, rows: [...block.rows, Array(colCount).fill('')] });
  }

  function removeRow(rowIdx: number) {
    onChange({ ...block, rows: block.rows.filter((_, i) => i !== rowIdx) });
  }

  function addColumn() {
    if (colCount >= 3) return; // max 3 colonnes (cf. spec)
    onChange({
      ...block,
      headers: [...block.headers, ''],
      rows: block.rows.map((r) => [...r, '']),
    });
  }

  function removeColumn(colIdx: number) {
    if (colCount <= 2) return; // min 2 colonnes
    onChange({
      ...block,
      headers: block.headers.filter((_, i) => i !== colIdx),
      rows: block.rows.map((r) => r.filter((_, i) => i !== colIdx)),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="muted" style={{ fontSize: 11 }}>
        2 ou 3 colonnes. Première ligne = en-têtes.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr) auto`, gap: 4 }}>
        {block.headers.map((h, colIdx) => (
          <div key={`h-${colIdx}`} style={{ display: 'flex', gap: 2 }}>
            <input
              className="input"
              style={{ flex: 1, fontWeight: 600 }}
              value={h}
              onChange={(e) => setHeader(colIdx, e.target.value)}
              placeholder={`Col ${colIdx + 1}`}
            />
            {colCount > 2 && (
              <button
                type="button"
                className="btn"
                title="Supprimer colonne"
                onClick={() => removeColumn(colIdx)}>
                ×
              </button>
            )}
          </div>
        ))}
        <div />
        {block.rows.map((row, rowIdx) =>
          row.map((cell, colIdx) => (
            <input
              key={`c-${rowIdx}-${colIdx}`}
              className="input"
              value={cell}
              onChange={(e) => setCell(rowIdx, colIdx, e.target.value)}
              placeholder="—"
            />
          )).concat(
            <button
              key={`d-${rowIdx}`}
              type="button"
              className="btn btn-danger"
              onClick={() => removeRow(rowIdx)}
              title="Supprimer ligne">
              ×
            </button>,
          ),
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn" onClick={addRow}>+ Ligne</button>
        <button
          type="button"
          className="btn"
          onClick={addColumn}
          disabled={colCount >= 3}>
          + Colonne
        </button>
      </div>
    </div>
  );
}

function ImageBlockEditor({
  block,
  assetsBucket,
  onChange,
}: {
  block: Extract<ReleaseNoteBlock, { type: 'image' }>;
  assetsBucket: string;
  onChange: (next: ReleaseNoteBlock) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Path : `<timestamp>-<slug>.<ext>`. Le timestamp évite les collisions
      // si on upload deux fichiers du même nom.
      const ext = file.name.split('.').pop() ?? 'bin';
      const slug = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 40);
      const path = `${Date.now()}-${slug}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(assetsBucket)
        .upload(path, file, { upsert: false });
      if (uploadErr) {
        setUploadError(uploadErr.message);
        return;
      }
      const { data } = supabase.storage.from(assetsBucket).getPublicUrl(path);
      onChange({ ...block, url: data.publicUrl });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="field" style={{ margin: 0 }}>
        <label>URL</label>
        <input
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
          placeholder="https://… ou upload ci-dessous"
        />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Upload (JPEG / PNG / GIF / WebP)</label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleUpload}
          disabled={uploading}
        />
        {uploading && (
          <div className="muted" style={{ fontSize: 12 }}>
            Upload en cours…
          </div>
        )}
        {uploadError && <div className="error">{uploadError}</div>}
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Texte alternatif (optionnel)</label>
        <input
          value={block.alt ?? ''}
          onChange={(e) =>
            onChange({ ...block, alt: e.target.value || undefined })
          }
          placeholder="Description courte (a11y)"
        />
      </div>
      {block.url && (
        <img
          src={block.url}
          alt={block.alt ?? ''}
          style={{
            maxWidth: '100%',
            maxHeight: 220,
            borderRadius: 8,
            objectFit: 'cover',
            border: '1px solid var(--line)',
          }}
        />
      )}
    </div>
  );
}

// ═══════════════ Helpers ═══════════════

export function makeEmptyBlock(type: ReleaseNoteBlock['type']): ReleaseNoteBlock {
  switch (type) {
    case 'title':
      return { type: 'title', text: '' };
    case 'text':
      return { type: 'text', text: '' };
    case 'quote':
      return { type: 'quote', text: '' };
    case 'list':
      return { type: 'list', items: [''] };
    case 'table':
      return { type: 'table', headers: ['', ''], rows: [['', '']] };
    case 'image':
      return { type: 'image', url: '' };
  }
}
