import { useEffect, useRef, useState } from 'react';
import { BookForm } from '../components/book-form';
import { BookList } from '../components/book-list';
import { supabase } from '../lib/supabase';
import type { BookCatalogRow } from '../lib/types';

const PAGE_SIZE = 100;

export function BooksSection() {
  const [books, setBooks] = useState<BookCatalogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedIsbn, setSelectedIsbn] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
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
    void load(debouncedQuery);
  }, [debouncedQuery]);

  async function load(q: string) {
    setLoading(true);
    setLoadError(null);
    let req = supabase
      .from('books')
      .select('*', { count: 'exact' })
      .order('cached_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (q.length > 0) {
      const escaped = q.replace(/[%_,]/g, (c) => `\\${c}`);
      const pattern = `%${escaped}%`;
      // Server-side OR sur isbn + title (substring case-insensitive).
      // Filtre auteur appliqué côté client après fetch (array column).
      req = req.or(`isbn.ilike.${pattern},title.ilike.${pattern}`);
    }

    const { data, error, count } = await req;
    setLoading(false);
    if (error) {
      setLoadError(error.message);
      return;
    }

    let rows = (data ?? []) as BookCatalogRow[];
    // Si la query ne matche aucun isbn/title mais peut matcher un auteur,
    // on tente un second fetch ciblé. PostgREST ne supporte pas ilike sur
    // array, on filtre donc une page brute par auteur côté client.
    if (q.length > 0 && rows.length === 0) {
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

  function onSaved(saved: BookCatalogRow) {
    setBooks((prev) => {
      const idx = prev.findIndex((b) => b.isbn === saved.isbn);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    setSelectedIsbn(saved.isbn);
  }

  function onDeleted(isbn: string) {
    setBooks((prev) => prev.filter((b) => b.isbn !== isbn));
    setTotal((t) => Math.max(0, t - 1));
    setSelectedIsbn(null);
  }

  const selected = books.find((b) => b.isbn === selectedIsbn) ?? null;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <BookList
        books={books}
        selectedIsbn={selectedIsbn}
        query={query}
        onQueryChange={setQuery}
        onSelect={setSelectedIsbn}
        loading={loading}
        total={total}
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
