import { useState } from 'react';
import type { AiCleanedBook } from '../lib/types';

type Field = 'title' | 'authors' | 'categories';

type Props = {
  isbn: string;
  current: { title: string; authors: string[]; categories: string[] };
  proposed: AiCleanedBook;
  model: string;
  onApply: (selected: { title?: string; authors?: string[]; categories?: string[] }) => Promise<void>;
  onClose: () => void;
};

export function AiCleanupModal({ current, proposed, model, onApply, onClose }: Props) {
  const [picked, setPicked] = useState<Record<Field, boolean>>({
    title: current.title !== proposed.title,
    authors: !arrayEq(current.authors, proposed.authors),
    categories: !arrayEq(current.categories, proposed.categories),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setSubmitting(true);
    setError(null);
    try {
      const selected: Parameters<Props['onApply']>[0] = {};
      if (picked.title) selected.title = proposed.title;
      if (picked.authors) selected.authors = proposed.authors;
      if (picked.categories) selected.categories = proposed.categories;
      await onApply(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  const noChanges =
    !picked.title && !picked.authors && !picked.categories;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          maxWidth: 720,
          width: '90%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0 }}>Proposition IA</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Modèle : <code>{model}</code> · Confiance :{' '}
            <strong>{Math.round(proposed.confidence * 100)}%</strong>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <DiffRow
            label="Titre"
            checked={picked.title}
            onToggle={(v) => setPicked((p) => ({ ...p, title: v }))}
            before={current.title}
            after={proposed.title}
            equal={current.title === proposed.title}
          />
          <DiffRow
            label="Auteurs"
            checked={picked.authors}
            onToggle={(v) => setPicked((p) => ({ ...p, authors: v }))}
            before={current.authors.join(', ') || '—'}
            after={proposed.authors.join(', ') || '—'}
            equal={arrayEq(current.authors, proposed.authors)}
          />
          <DiffRow
            label="Catégories"
            checked={picked.categories}
            onToggle={(v) => setPicked((p) => ({ ...p, categories: v }))}
            before={current.categories.join(', ') || '—'}
            after={proposed.categories.join(', ') || '—'}
            equal={arrayEq(current.categories, proposed.categories)}
          />

          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}>
          <button className="btn" onClick={onClose} disabled={submitting}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={apply}
            disabled={submitting || noChanges}>
            {submitting ? 'Application…' : 'Appliquer la sélection'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffRow({
  label,
  checked,
  onToggle,
  before,
  after,
  equal,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  before: string;
  after: string;
  equal: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 90px 1fr 1fr',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--line)',
        alignItems: 'start',
      }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        disabled={equal}
        style={{ marginTop: 4 }}
      />
      <div style={{ fontWeight: 600, fontSize: 13, paddingTop: 2 }}>
        {label}
        {equal && (
          <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>identique</div>
        )}
      </div>
      <div>
        <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>
          Avant
        </div>
        <div style={{ fontSize: 13, opacity: equal ? 0.5 : 1 }}>{before}</div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>
          Proposé
        </div>
        <div
          style={{
            fontSize: 13,
            color: equal ? 'var(--ink-muted)' : 'var(--accent)',
            fontWeight: equal ? 400 : 600,
          }}>
          {after}
        </div>
      </div>
    </div>
  );
}

function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
