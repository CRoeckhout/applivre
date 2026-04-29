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
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const queryTimer = useRef<number | null>(null);
  // Mémorise le dernier appel `load` pour ignorer les réponses obsolètes
  // quand la query/les filtres changent en plein vol.
  const loadIdRef = useRef(0);

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
    void load(debouncedQuery, activeFilters, false);
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
      or: (filters: string) => T;
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

  async function load(q: string, filters: Set<QuickFilter>, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError(null);

    const myId = ++loadIdRef.current;

    // Pagination par range : append fetch à partir de books.length, sinon 0.
    // `range` est inclusif des deux côtés ; PAGE_SIZE rows par appel.
    const start = append ? books.length : 0;
    const end = start + PAGE_SIZE - 1;

    const req = supabase
      .from('books')
      .select('*', { count: 'exact' })
      .order('cached_at', { ascending: false });

    // Postgrest builders mutent et renvoient `this` ; on ignore la valeur de
    // retour. Cast `as any` au call site pour empêcher TS d'instancier en
    // chaîne le générique d'applyQuickFilter (sinon : "Type instantiation is
    // excessively deep") quand le builder est sans `.limit()` initial.
    for (const f of filters) {
      applyQuickFilter(req as never, f);
    }

    if (q.length > 0) {
      const escaped = q.replace(/[%_,]/g, (c) => `\\${c}`);
      const pattern = `%${escaped}%`;
      req.or(`isbn.ilike.${pattern},title.ilike.${pattern}`);
    }

    // `range` chaîné en dernier (et non ré-affecté) : évite l'explosion de
    // type generic instantiation quand on combine range + applyQuickFilter.
    const { data, error, count } = await req.range(start, end);
    if (myId !== loadIdRef.current) return; // résultat obsolète, drop
    if (append) setLoadingMore(false);
    else setLoading(false);
    if (error) {
      setLoadError(error.message);
      return;
    }

    let rows = (data ?? []) as BookCatalogRow[];
    // Fallback recherche auteur (PostgREST ilike pas sur array). Uniquement
    // au premier load (pas append) et si résultat principal vide. Skip si
    // filtres actifs — on chainerait des filtres en mémoire, pas le but.
    if (!append && q.length > 0 && rows.length === 0 && filters.size === 0) {
      const fallback = await supabase
        .from('books')
        .select('*', { count: 'exact' })
        .order('cached_at', { ascending: false })
        .limit(500);
      if (myId !== loadIdRef.current) return;
      if (!fallback.error) {
        const needle = q.toLowerCase();
        rows = ((fallback.data ?? []) as BookCatalogRow[]).filter((b) =>
          b.authors.some((a) => a.toLowerCase().includes(needle)),
        );
      }
    }

    setBooks((prev) => (append ? [...prev, ...rows] : rows));
    setTotal(count ?? 0);
  }

  function loadMore() {
    if (loading || loadingMore) return;
    if (books.length >= total) return;
    void load(debouncedQuery, activeFilters, true);
  }

  async function loadCounts() {
    const entries = await Promise.all(
      QUICK_FILTERS.map(async (f) => {
        const req = supabase
          .from('books')
          .select('isbn', { count: 'exact', head: true });
        applyQuickFilter(req as never, f);
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
        loadingMore={loadingMore}
        total={total}
        activeFilters={activeFilters}
        filterCounts={filterCounts}
        onToggleFilter={toggleFilter}
        onLoadMore={loadMore}
        hasMore={books.length < total}
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
