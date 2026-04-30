import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BookCatalogRow } from '../lib/types';

type Props = {
  onCreated: (row: BookCatalogRow) => void;
  onClose: () => void;
};

function parseCsv(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function generateManualIsbn(): string {
  return `manual-${crypto.randomUUID()}`;
}

export function NewBookModal({ onCreated, onClose }: Props) {
  const [isbn, setIsbn] = useState('');
  const [title, setTitle] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [pages, setPages] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [categoriesText, setCategoriesText] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setError(null);
    if (!title.trim()) {
      setError('Titre requis');
      return;
    }
    const pagesNum = pages.trim() === '' ? null : Number.parseInt(pages, 10);
    if (pagesNum != null && (!Number.isFinite(pagesNum) || pagesNum < 0)) {
      setError('Pages doit être un entier positif');
      return;
    }
    const finalIsbn = isbn.trim() || generateManualIsbn();

    setSubmitting(true);
    try {
      const row = {
        isbn: finalIsbn,
        title: title.trim(),
        authors: parseCsv(authorsText),
        pages: pagesNum,
        published_at: publishedAt.trim() || null,
        cover_url: coverUrl.trim() || null,
        source: 'manual' as const,
        categories: parseCsv(categoriesText),
      };
      const { data, error: insErr } = await supabase
        .from('books')
        .insert(row)
        .select()
        .single();
      if (insErr) {
        setError(`Création échec : ${insErr.message}`);
        return;
      }
      onCreated(data as BookCatalogRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          border: '1px solid var(--line)',
          padding: 24,
          width: 480,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Nouveau livre</h2>

        <div className="field">
          <label>ISBN (vide = auto manual-…)</label>
          <input
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="9782070612758 ou laisser vide"
          />
        </div>

        <div className="field">
          <label>Titre *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div className="field">
          <label>Auteurs (CSV)</label>
          <input
            value={authorsText}
            onChange={(e) => setAuthorsText(e.target.value)}
            placeholder="Auteur 1, Auteur 2"
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Pages</label>
            <input
              type="number"
              min={0}
              value={pages}
              onChange={(e) => setPages(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Année / date publication</label>
            <input
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
              placeholder="2023"
            />
          </div>
        </div>

        <div className="field">
          <label>Couverture (URL)</label>
          <input
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="field">
          <label>Catégories (CSV)</label>
          <input
            value={categoriesText}
            onChange={(e) => setCategoriesText(e.target.value)}
            placeholder="Roman, Science-fiction"
          />
        </div>

        {error && (
          <div className="error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={submitting}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={save} disabled={submitting}>
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}
