import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  RELEASE_NOTE_BLOCK_LABELS,
  RELEASE_NOTE_BLOCK_TYPES,
  type ReleaseNoteBlock,
  type ReleaseNoteRow,
} from '../lib/types';

type Props = {
  initial: ReleaseNoteRow | null;
  onSaved: (saved: ReleaseNoteRow) => void;
  onDeleted: (id: string) => void;
};

const ASSETS_BUCKET = 'release-notes-assets';

export function ReleaseNoteForm({ initial, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  // Création : pré-remplit avec la version courante d'`app.json`
  // (injectée par Vite via `__APP_VERSION__`). Édition : on garde la
  // version existante en base.
  const [version, setVersion] = useState(initial?.version ?? __APP_VERSION__);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [publishedAt, setPublishedAt] = useState(
    initial?.published_at ? toLocalInput(initial.published_at) : toLocalInput(new Date().toISOString()),
  );
  const [blocks, setBlocks] = useState<ReleaseNoteBlock[]>(initial?.body ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setVersion(initial?.version ?? __APP_VERSION__);
    setTitle(initial?.title ?? '');
    setPublishedAt(
      initial?.published_at
        ? toLocalInput(initial.published_at)
        : toLocalInput(new Date().toISOString()),
    );
    setBlocks(initial?.body ?? []);
    setError(null);
    setSuccess(null);
  }, [initial]);

  function addBlock(type: ReleaseNoteBlock['type']) {
    setBlocks((prev) => [...prev, makeEmptyBlock(type)]);
  }

  function updateBlock(idx: number, next: ReleaseNoteBlock) {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? next : b)));
  }

  function removeBlock(idx: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveBlock(idx: number, direction: -1 | 1) {
    setBlocks((prev) => {
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function save() {
    setError(null);
    setSuccess(null);

    const v = version.trim();
    const t = title.trim();
    if (!v || !t) {
      setError('version et titre requis');
      return;
    }
    if (!/^[0-9]+(\.[0-9]+){0,3}$/.test(v)) {
      setError('version doit être numérique style "1.2.0"');
      return;
    }

    setSubmitting(true);
    try {
      const row = {
        version: v,
        title: t,
        body: blocks,
        published_at: new Date(publishedAt).toISOString(),
      };
      let saved: ReleaseNoteRow;
      if (isNew) {
        const { data, error: err } = await supabase
          .from('release_notes')
          .insert(row)
          .select()
          .single();
        if (err) {
          setError(err.message);
          return;
        }
        saved = data as ReleaseNoteRow;
      } else {
        const { data, error: err } = await supabase
          .from('release_notes')
          .update(row)
          .eq('id', initial!.id)
          .select()
          .single();
        if (err) {
          setError(err.message);
          return;
        }
        saved = data as ReleaseNoteRow;
      }
      setSuccess('Enregistré.');
      onSaved(saved);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Supprimer la note v${initial.version} ? Cette action est irréversible.`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('release_notes')
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
    <main style={{ flex: 1, padding: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 720,
          margin: '0 auto',
          padding: '16px 24px 24px',
        }}>
        <h2 style={{ marginTop: 0 }}>{isNew ? 'Nouvelle note' : `v${initial?.version}`}</h2>

        <div className="field">
          <label>Version</label>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="ex: 1.2.0"
          />
          <div className="muted" style={{ fontSize: 12 }}>
            Version courante de l'app : <code>{__APP_VERSION__}</code>{' '}
            {version !== __APP_VERSION__ && (
              <button
                type="button"
                className="btn"
                style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11 }}
                onClick={() => setVersion(__APP_VERSION__)}>
                Réinitialiser
              </button>
            )}
            <div style={{ marginTop: 4 }}>
              Lue depuis <code>app.json</code> au build. Programme{' '}
              <code>published_at</code> à la date d'approbation store estimée
              pour différer l'affichage côté users.
            </div>
          </div>
        </div>

        <div className="field">
          <label>Titre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex: Lecture audio améliorée"
          />
        </div>

        <div className="field">
          <label>Date de publication</label>
          <input
            type="datetime-local"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
          />
          <div className="muted" style={{ fontSize: 12 }}>
            Date future ⇒ note programmée (cachée aux users jusqu'à cette date).
          </div>
        </div>

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {blocks.map((block, idx) => (
              <BlockEditor
                key={idx}
                block={block}
                isFirst={idx === 0}
                isLast={idx === blocks.length - 1}
                onChange={(next) => updateBlock(idx, next)}
                onRemove={() => removeBlock(idx)}
                onMoveUp={() => moveBlock(idx, -1)}
                onMoveDown={() => moveBlock(idx, 1)}
              />
            ))}
          </div>

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

        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
        {success && <div className="success" style={{ marginBottom: 12 }}>{success}</div>}

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
    </main>
  );
}

// ═══════════════ BlockEditor ═══════════════

type BlockEditorProps = {
  block: ReleaseNoteBlock;
  isFirst: boolean;
  isLast: boolean;
  onChange: (next: ReleaseNoteBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

function BlockEditor({
  block,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: BlockEditorProps) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--surface-2)',
      }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
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
        <input
          className="input"
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Titre du bloc"
        />
      )}

      {block.type === 'text' && (
        <textarea
          className="input"
          rows={3}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Paragraphe"
        />
      )}

      {block.type === 'list' && (
        <ListBlockEditor block={block} onChange={onChange} />
      )}

      {block.type === 'table' && (
        <TableBlockEditor block={block} onChange={onChange} />
      )}

      {block.type === 'image' && (
        <ImageBlockEditor block={block} onChange={onChange} />
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {block.items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={item}
            onChange={(e) => {
              const items = block.items.slice();
              items[idx] = e.target.value;
              onChange({ ...block, items });
            }}
            placeholder={`Item ${idx + 1}`}
          />
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onChange({ ...block, items: block.items.filter((_, i) => i !== idx) })}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange({ ...block, items: [...block.items, ''] })}>
        + Ajouter
      </button>
    </div>
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
  onChange,
}: {
  block: Extract<ReleaseNoteBlock, { type: 'image' }>;
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
        .from(ASSETS_BUCKET)
        .upload(path, file, { upsert: false });
      if (uploadErr) {
        setUploadError(uploadErr.message);
        return;
      }
      const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
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

function makeEmptyBlock(type: ReleaseNoteBlock['type']): ReleaseNoteBlock {
  switch (type) {
    case 'title':
      return { type: 'title', text: '' };
    case 'text':
      return { type: 'text', text: '' };
    case 'list':
      return { type: 'list', items: [''] };
    case 'table':
      return { type: 'table', headers: ['', ''], rows: [['', '']] };
    case 'image':
      return { type: 'image', url: '' };
  }
}

// Convertit un ISO timestamp en valeur acceptée par <input type="datetime-local">
// (yyyy-MM-ddTHH:mm, sans timezone).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
