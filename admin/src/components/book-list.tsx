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
  total: number;
  activeFilters: Set<QuickFilter>;
  filterCounts: Record<QuickFilter, number>;
  onToggleFilter: (f: QuickFilter) => void;
};

export function BookList({
  books,
  selectedIsbn,
  query,
  onQueryChange,
  onSelect,
  loading,
  total,
  activeFilters,
  filterCounts,
  onToggleFilter,
}: Props) {
  return (
    <aside style={{ width: 360, borderRight: '1px solid var(--line)', overflow: 'auto', background: 'white' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
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
                  background: active ? 'var(--accent)' : 'white',
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
                    background: active ? 'rgba(255,255,255,0.25)' : '#eee',
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
                background: selected ? '#f5f0ea' : 'transparent',
                borderBottom: '1px solid var(--line)',
              }}>
              <div
                style={{
                  width: 40,
                  height: 56,
                  borderRadius: 4,
                  border: '1px solid var(--line)',
                  background: '#faf6f0',
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
      </ul>
    </aside>
  );
}
