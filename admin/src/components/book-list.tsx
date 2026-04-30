import { useEffect, useRef } from 'react';
import type { BookCatalogRow } from '../lib/types';

export type QuickFilter =
  | 'no_cover'
  | 'no_categories'
  | 'no_isbn'
  | 'no_pages'
  | 'no_year';

export const QUICK_FILTERS: QuickFilter[] = [
  'no_cover',
  'no_categories',
  'no_isbn',
  'no_pages',
  'no_year',
];

const FILTER_LABELS: Record<QuickFilter, string> = {
  no_cover: 'Sans image',
  no_categories: 'Sans catégorie',
  no_isbn: 'Sans ISBN',
  no_pages: 'Sans pages',
  no_year: 'Sans année',
};

type Props = {
  books: BookCatalogRow[];
  selectedIsbn: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (isbn: string) => void;
  loading: boolean;
  loadingMore: boolean;
  total: number;
  activeFilters: Set<QuickFilter>;
  filterCounts: Record<QuickFilter, number>;
  onToggleFilter: (f: QuickFilter) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  onNew: () => void;
};

// Distance en pixels avant le bas du scroll à laquelle on déclenche le
// chargement de la page suivante. Un seuil > 0 évite de devoir toucher le
// fond exact pour fetcher la suite.
const LOAD_MORE_THRESHOLD_PX = 200;

export function BookList({
  books,
  selectedIsbn,
  query,
  onQueryChange,
  onSelect,
  loading,
  loadingMore,
  total,
  activeFilters,
  filterCounts,
  onToggleFilter,
  onLoadMore,
  hasMore,
  onNew,
}: Props) {
  const scrollerRef = useRef<HTMLElement | null>(null);

  // Scroll handler : déclenche `onLoadMore` quand on approche du fond.
  // Re-attaché à chaque changement de hasMore/loadingMore — sinon le handler
  // capture des valeurs périmées et fire en boucle ou pas du tout.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onScroll() {
      if (!el || !hasMore || loadingMore) return;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < LOAD_MORE_THRESHOLD_PX) onLoadMore();
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <aside ref={scrollerRef} style={{ width: 360, borderRight: '1px solid var(--line)', overflow: 'auto', background: 'var(--surface)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
        <button
          onClick={onNew}
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
        >
          + Nouveau livre
        </button>
        <input
          type="search"
          placeholder="ISBN, titre, auteur…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {QUICK_FILTERS.map((f) => {
            const active = activeFilters.has(f);
            const count = filterCounts[f];
            return (
              <button
                key={f}
                onClick={() => onToggleFilter(f)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor: active ? 'var(--accent)' : 'var(--line)',
                  background: active ? 'var(--accent)' : 'var(--surface)',
                  color: active ? 'white' : 'var(--ink)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                {FILTER_LABELS[f]}
                <span
                  style={{
                    display: 'inline-block',
                    minWidth: 18,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: active ? 'var(--count-bg-active)' : 'var(--count-bg)',
                    color: active ? 'white' : 'var(--ink-muted)',
                    fontSize: 10,
                    fontWeight: 700,
                    textAlign: 'center',
                    lineHeight: '14px',
                  }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          {loading ? 'Chargement…' : `${books.length} affichés / ${total} total`}
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {books.map((b) => {
          const selected = selectedIsbn === b.isbn;
          return (
            <li
              key={b.isbn}
              onClick={() => onSelect(b.isbn)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                cursor: 'pointer',
                background: selected ? 'var(--surface-2)' : 'transparent',
                borderBottom: '1px solid var(--line)',
              }}>
              <div
                style={{
                  width: 40,
                  height: 56,
                  borderRadius: 4,
                  border: '1px solid var(--line)',
                  background: 'var(--surface-3)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                {b.cover_url ? (
                  <img src={b.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span className="muted" style={{ fontSize: 10 }}>?</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.title || '(sans titre)'}
                </div>
                <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.authors.length > 0 ? b.authors.join(', ') : '—'}
                </div>
                <div className="muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>{b.isbn}</div>
              </div>
            </li>
          );
        })}
        {!loading && books.length === 0 && (
          <li style={{ padding: 24, textAlign: 'center' }} className="muted">Aucun livre</li>
        )}
        {books.length > 0 && hasMore && (
          <li style={{ padding: 12, textAlign: 'center', fontSize: 11 }} className="muted">
            {loadingMore ? 'Chargement…' : `${books.length} / ${total}`}
          </li>
        )}
        {books.length > 0 && !hasMore && (
          <li style={{ padding: 12, textAlign: 'center', fontSize: 11 }} className="muted">
            Fin · {total} livre{total > 1 ? 's' : ''}
          </li>
        )}
      </ul>
    </aside>
  );
}
