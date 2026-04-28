import { useEffect, useRef, useState } from 'react';
import { BookForm } from '../components/book-form';
import { BookList, QUICK_FILTERS, type QuickFilter } from '../components/book-list';
import { supabase } from '../lib/supabase';
import type { BookCatalogRow } from '../lib/types';

const PAGE_SIZE = 100;

type FilterCounts = Record<QuickFilter, number>;

const ZERO_COUNTS: FilterCounts = {
  no_cover: 0,
  no_categories: 0,
  no_isbn: 0,
  no_pages: 0,
  no_year: 0,
};

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function BooksSection({ itemId, onItemChange }: Props) {
  const [books, setBooks] = useState<BookCatalogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [directFetched, setDirectFetched] = useState<BookCatalogRow | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<QuickFilter>>(new Set());
  const [filterCounts, setFilterCounts] = useState<FilterCounts>(ZERO_COUNTS);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const queryTimer = useRef<number | null>(null);

  useEffect(() => {
    if (queryTimer.current) window.clearTimeout(queryTimer.current);
    queryTimer.current = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => {
      if (queryTimer.current) window.clearTimeout(queryTimer.current);
    };
  }, [query]);

  useEffect(() => {
    void load(debouncedQuery, activeFilters);
  }, [debouncedQuery, activeFilters]);

  useEffect(() => {
    void loadCounts();
  }, []);

  // Si l'isbn de la route ne se trouve pas dans la liste filtrée actuelle
  // (ex: deeplink vers une row hors page courante), on fetch directement.
  useEffect(() => {
    if (!itemId) {
      setDirectFetched(null);
      return;
    }
    if (books.some((b) => b.isbn === itemId)) {
      setDirectFetched(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('books')
        .select('*')
        .eq('isbn', itemId)
        .maybeSingle();
      if (!cancelled) setDirectFetched((data as BookCatalogRow) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, books]);

  function applyQuickFilter<T>(
    req: T & {
      is: (col: string, val: unknown) => T;
      eq: (col: string, val: unknown) => T;
      like: (col: string, val: string) => T;
      filter: (col: string, op: string, val: string) => T;
    },
    f: QuickFilter,
  ): T {
    switch (f) {
      case 'no_cover':
        return req.is('cover_url', null);
      case 'no_categories':
        // categories text[] NOT NULL default '{}'. Empty array = '{}'.
        return req.filter('categories', 'eq', '{}');
      case 'no_isbn':
        // ISBN saisis manuellement : `manual-<uuid>`.
        return req.like('isbn', 'manual-%');
      case 'no_pages':
        return req.is('pages', null);
      case 'no_year':
        return req.is('published_at', null);
    }
  }

  async function load(q: string, filters: Set<QuickFilter>) {
    setLoading(true);
    setLoadError(null);
    let req = supabase
      .from('books')
      .select('*', { count: 'exact' })
      .order('cached_at', { ascending: false })
      .limit(PAGE_SIZE);

    for (const f of filters) {
      req = applyQuickFilter(req, f);
    }

    if (q.length > 0) {
      const escaped = q.replace(/[%_,]/g, (c) => `\\${c}`);
      const pattern = `%${escaped}%`;
      req = req.or(`isbn.ilike.${pattern},title.ilike.${pattern}`);
    }

    const { data, error, count } = await req;
    setLoading(false);
    if (error) {
      setLoadError(error.message);
      return;
    }

    let rows = (data ?? []) as BookCatalogRow[];
    // Fallback recherche auteur (PostgREST ilike pas sur array).
    // Skip si filtres actifs — on chainerait des filtres en mémoire, pas le but.
    if (q.length > 0 && rows.length === 0 && filters.size === 0) {
      const fallback = await supabase
        .from('books')
        .select('*', { count: 'exact' })
        .order('cached_at', { ascending: false })
        .limit(500);
      if (!fallback.error) {
        const needle = q.toLowerCase();
        rows = ((fallback.data ?? []) as BookCatalogRow[]).filter((b) =>
          b.authors.some((a) => a.toLowerCase().includes(needle)),
        );
      }
    }

    setBooks(rows);
    setTotal(count ?? 0);
  }

  async function loadCounts() {
    const entries = await Promise.all(
      QUICK_FILTERS.map(async (f) => {
        let req = supabase
          .from('books')
          .select('isbn', { count: 'exact', head: true });
        req = applyQuickFilter(req, f);
        const { count } = await req;
        return [f, count ?? 0] as const;
      }),
    );
    const next = { ...ZERO_COUNTS };
    for (const [f, c] of entries) next[f] = c;
    setFilterCounts(next);
  }

  function toggleFilter(f: QuickFilter) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  function onSaved(saved: BookCatalogRow) {
    setBooks((prev) => {
      const idx = prev.findIndex((b) => b.isbn === saved.isbn);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    setDirectFetched((prev) => (prev && prev.isbn === saved.isbn ? saved : prev));
    onItemChange(saved.isbn);
    void loadCounts();
  }

  function onDeleted(isbn: string) {
    setBooks((prev) => prev.filter((b) => b.isbn !== isbn));
    setTotal((t) => Math.max(0, t - 1));
    setDirectFetched(null);
    onItemChange(null);
    void loadCounts();
  }

  const selected =
    (itemId ? books.find((b) => b.isbn === itemId) ?? null : null) ??
    (directFetched && directFetched.isbn === itemId ? directFetched : null);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <BookList
        books={books}
        selectedIsbn={itemId}
        query={query}
        onQueryChange={setQuery}
        onSelect={onItemChange}
        loading={loading}
        total={total}
        activeFilters={activeFilters}
        filterCounts={filterCounts}
        onToggleFilter={toggleFilter}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Load error: {loadError}
          </div>
        )}
        {selected ? (
          <BookForm key={selected.isbn} initial={selected} onSaved={onSaved} onDeleted={onDeleted} />
        ) : (
          <main style={{ flex: 1, padding: 40, textAlign: 'center' }} className="muted">
            Sélectionne un livre à gauche.
          </main>
        )}
      </div>
    </div>
  );
}
