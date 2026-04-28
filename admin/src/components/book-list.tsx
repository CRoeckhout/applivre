import type { BookCatalogRow } from '../lib/types';

type Props = {
  books: BookCatalogRow[];
  selectedIsbn: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (isbn: string) => void;
  loading: boolean;
  total: number;
};

export function BookList({
  books,
  selectedIsbn,
  query,
  onQueryChange,
  onSelect,
  loading,
  total,
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
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
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
