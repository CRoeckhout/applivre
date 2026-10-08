import { useEffect, useMemo, useState } from 'react';
import {
  AsideCollapseButton,
  CollapsedAsideStrip,
  MOBILE_ASIDE_OVERLAY_STYLE,
  MobileAsideBackdrop,
} from '../components/collapsible-aside';
import { UserRichCardLoader } from '../components/user-rich-card-loader';
import { supabase } from '../lib/supabase';
import {
  BOOK_SUBMISSION_STATUS_LABELS,
  BOOK_SUBMISSION_STATUSES,
  type BookSubmissionRow,
  type BookSubmissionStatus,
} from '../lib/types';
import { useCollapsibleAside } from '../lib/use-collapsible-aside';

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
  // Badge « en attente » sur le tab (cf. App.tsx).
  onPendingCountChange?: (count: number) => void;
};

type StatusFilter = BookSubmissionStatus | 'all';

const FILTER_STORAGE_KEY = 'admin-book-submissions-filter';

function readPersistedFilter(): StatusFilter {
  try {
    const v = localStorage.getItem(FILTER_STORAGE_KEY);
    if (v === 'all' || BOOK_SUBMISSION_STATUSES.includes(v as BookSubmissionStatus)) {
      return v as StatusFilter;
    }
  } catch {
    // ignore
  }
  return 'pending';
}

const STATUS_COLORS: Record<BookSubmissionStatus, string> = {
  pending: '#f59e0b',
  approved: '#34d399',
  rejected: '#ef4444',
};

const REMOVED_COLOR = '#9ca3af';
const REMOVED_LABEL = 'Supprimé du catalogue';

function sortRows(rows: BookSubmissionRow[]): BookSubmissionRow[] {
  return rows.slice().sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

// Livres introuvables soumis depuis le scanner (cf. migration 0077).
// L'admin corrige les champs puis approuve (upsert `books` via RPC) ou refuse.
export function BookSubmissionsSection({ itemId, onItemChange, onPendingCountChange }: Props) {
  const [rows, setRows] = useState<BookSubmissionRow[]>([]);
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>(() => readPersistedFilter());

  const setStatusFilter = (next: StatusFilter) => {
    setStatusFilterState(next);
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  // Clés `book_isbn` des soumissions approuvées dont la row `books` n'existe
  // plus (suppression depuis l'onglet Livres : pas de FK, la soumission reste
  // `approved`).
  const [removedIsbns, setRemovedIsbns] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('book_submissions')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) {
        setLoadError(error.message);
        return;
      }
      const loaded = (data ?? []) as BookSubmissionRow[];
      setRows(sortRows(loaded));

      const approvedIsbns = [
        ...new Set(loaded.filter((r) => r.status === 'approved').map((r) => r.book_isbn)),
      ];
      if (approvedIsbns.length === 0) return;
      const { data: books, error: booksErr } = await supabase
        .from('books')
        .select('isbn')
        .in('isbn', approvedIsbns);
      if (booksErr) {
        setLoadError(booksErr.message);
        return;
      }
      const present = new Set((books ?? []).map((b) => b.isbn as string));
      setRemovedIsbns(new Set(approvedIsbns.filter((isbn) => !present.has(isbn))));
    })();
  }, []);

  const counts = useMemo(() => {
    const acc: Record<BookSubmissionStatus, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const r of rows) acc[r.status]++;
    return acc;
  }, [rows]);

  useEffect(() => {
    onPendingCountChange?.(counts.pending);
  }, [counts.pending, onPendingCountChange]);

  function onDecided(saved: BookSubmissionRow) {
    setRows((prev) => sortRows(prev.map((r) => (r.id === saved.id ? saved : r))));
  }

  function onArchived(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    onItemChange(null);
  }

  const isRemoved = (r: BookSubmissionRow) => r.status === 'approved' && removedIsbns.has(r.book_isbn);

  const selected = rows.find((r) => r.id === itemId) ?? null;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <SubmissionList
        rows={rows}
        selectedId={itemId}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        counts={counts}
        search={search}
        onSearchChange={setSearch}
        onSelect={onItemChange}
        isRemoved={isRemoved}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Load error: {loadError}
          </div>
        )}
        {selected ? (
          <SubmissionForm
            key={selected.id}
            row={selected}
            removed={isRemoved(selected)}
            onDecided={onDecided}
            onArchived={onArchived}
          />
        ) : (
          <main style={{ flex: 1, padding: 40, textAlign: 'center' }} className="muted">
            Sélectionne une soumission à gauche.
          </main>
        )}
      </div>
    </div>
  );
}

// ═════════════ Liste ═════════════

function SubmissionList({
  rows,
  selectedId,
  statusFilter,
  onStatusFilterChange,
  counts,
  search,
  onSearchChange,
  onSelect,
  isRemoved,
}: {
  rows: BookSubmissionRow[];
  selectedId: string | null;
  statusFilter: StatusFilter;
  onStatusFilterChange: (s: StatusFilter) => void;
  counts: Record<BookSubmissionStatus, number>;
  search: string;
  onSearchChange: (s: string) => void;
  onSelect: (id: string) => void;
  isRemoved: (r: BookSubmissionRow) => boolean;
}) {
  const [collapsed, toggleCollapsed, isMobile] = useCollapsibleAside();
  const q = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (statusFilter === 'all' || r.status === statusFilter) &&
      (!q ||
        r.title.toLowerCase().includes(q) ||
        (r.isbn ?? '').includes(q) ||
        r.authors.some((a) => a.toLowerCase().includes(q))),
  );

  if (collapsed) {
    return <CollapsedAsideStrip onExpand={toggleCollapsed} label="soumissions" />;
  }

  return (
    <>
      {isMobile && <CollapsedAsideStrip onExpand={toggleCollapsed} label="soumissions" />}
      {isMobile && <MobileAsideBackdrop onClose={toggleCollapsed} />}
      <aside
        style={{
          width: 360,
          borderRight: '1px solid var(--line)',
          overflow: 'auto',
          background: 'var(--surface)',
          ...(isMobile ? MOBILE_ASIDE_OVERLAY_STYLE : null),
        }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--line)',
            position: 'sticky',
            top: 0,
            background: 'var(--surface)',
            zIndex: 1,
          }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <AsideCollapseButton onCollapse={toggleCollapsed} />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filtrer (titre, auteur, ISBN)"
              style={{
                flex: 1,
                padding: '6px 10px',
                border: '1px solid var(--line)',
                borderRadius: 6,
                background: 'var(--surface-2)',
                color: 'var(--ink)',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <FilterPill
              label={`Tous · ${rows.length}`}
              active={statusFilter === 'all'}
              onClick={() => onStatusFilterChange('all')}
            />
            {BOOK_SUBMISSION_STATUSES.map((s) => (
              <FilterPill
                key={s}
                label={`${BOOK_SUBMISSION_STATUS_LABELS[s]} · ${counts[s]}`}
                color={STATUS_COLORS[s]}
                active={statusFilter === s}
                onClick={() => onStatusFilterChange(s)}
              />
            ))}
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filtered.map((r) => (
            <li
              key={r.id}
              onClick={() => onSelect(r.id)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                background: selectedId === r.id ? 'var(--surface-2)' : 'transparent',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
              <Cover url={r.cover_url} width={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                  {r.title}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {r.authors.join(', ') || '—'} · {new Date(r.created_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
              {isRemoved(r) && (
                <span style={{ fontSize: 10, fontWeight: 700, color: REMOVED_COLOR, flexShrink: 0 }}>
                  Supprimé
                </span>
              )}
              <span
                title={isRemoved(r) ? REMOVED_LABEL : BOOK_SUBMISSION_STATUS_LABELS[r.status]}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: isRemoved(r) ? REMOVED_COLOR : STATUS_COLORS[r.status],
                  flexShrink: 0,
                }}
              />
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="muted" style={{ padding: 16, fontSize: 13 }}>
              Aucune soumission.
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}

function FilterPill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        border: `1px solid ${active ? (color ?? 'var(--ink)') : 'var(--line)'}`,
        background: active ? (color ?? 'var(--ink)') : 'transparent',
        color: active ? 'white' : 'var(--ink)',
      }}>
      {label}
    </button>
  );
}

function Cover({ url, width }: { url: string | null; width: number }) {
  const height = Math.round(width * 1.5);
  if (!url) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: 4,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      style={{ width, height, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
    />
  );
}

// ═════════════ Formulaire de revue ═════════════

function parseCsv(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function SubmissionForm({
  row,
  removed,
  onDecided,
  onArchived,
}: {
  row: BookSubmissionRow;
  removed: boolean;
  onDecided: (row: BookSubmissionRow) => void;
  onArchived: (id: string) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [authorsText, setAuthorsText] = useState(row.authors.join(', '));
  const [categoriesText, setCategoriesText] = useState(row.categories.join(', '));
  const [pages, setPages] = useState(String(row.pages));
  const [publishedAt, setPublishedAt] = useState(row.published_at ?? '');
  const [coverUrl, setCoverUrl] = useState(row.cover_url ?? '');
  const [reason, setReason] = useState(row.decision_reason ?? '');
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | 'archive' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPending = row.status === 'pending';

  async function decide(decision: 'approve' | 'reject') {
    setError(null);
    const pagesNum = Number.parseInt(pages, 10);
    if (decision === 'approve') {
      if (!title.trim()) {
        setError('Titre requis');
        return;
      }
      if (!Number.isFinite(pagesNum) || pagesNum <= 0) {
        setError('Pages doit être un entier positif');
        return;
      }
    }
    if (decision === 'reject' && !reason.trim()) {
      if (!window.confirm('Refuser sans motif ?')) return;
    }
    setSubmitting(decision);
    const { data, error: rpcErr } = await supabase.rpc('decide_book_submission', {
      p_submission_id: row.id,
      p_decision: decision,
      p_reason: reason.trim() || null,
      p_book:
        decision === 'approve'
          ? {
              title: title.trim(),
              authors: parseCsv(authorsText),
              categories: parseCsv(categoriesText),
              pages: pagesNum,
              published_at: publishedAt.trim(),
              cover_url: coverUrl.trim(),
            }
          : null,
    });
    setSubmitting(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    onDecided(data as BookSubmissionRow);
  }

  async function archive() {
    const message = isPending
      ? `Supprimer la soumission "${row.title}" sans décision ? Elle sera marquée refusée pour l'utilisateur (conservée en base).`
      : `Supprimer la soumission "${row.title}" ? Elle reste conservée en base.`;
    if (!window.confirm(message)) return;
    setError(null);
    setSubmitting('archive');
    const { error: rpcErr } = await supabase.rpc('archive_book_submission', {
      p_submission_id: row.id,
    });
    setSubmitting(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    onArchived(row.id);
  }

  return (
    <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>Livre soumis</h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            color: 'white',
            background: STATUS_COLORS[row.status],
          }}>
          {BOOK_SUBMISSION_STATUS_LABELS[row.status]}
        </span>
        {removed && (
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              color: 'white',
              background: REMOVED_COLOR,
            }}>
            {REMOVED_LABEL}
          </span>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          Clé catalogue : <code>{row.book_isbn}</code>
        </span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
        Soumis le {new Date(row.created_at).toLocaleString('fr-FR')}
        {row.decided_at ? <> · Décision le {new Date(row.decided_at).toLocaleString('fr-FR')}</> : null}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }} className="muted">
          Soumis par
        </div>
        <UserRichCardLoader userId={row.user_id} />
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <Cover url={coverUrl.trim() || null} width={120} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="field">
            <label>Titre *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isPending} />
          </div>
          <div className="field">
            <label>Auteurs (CSV)</label>
            <input
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              disabled={!isPending}
            />
          </div>
          <div className="field">
            <label>Genres (CSV)</label>
            <input
              value={categoriesText}
              onChange={(e) => setCategoriesText(e.target.value)}
              disabled={!isPending}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Pages *</label>
              <input
                type="number"
                min={1}
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                disabled={!isPending}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Année</label>
              <input
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                disabled={!isPending}
              />
            </div>
          </div>
          <div className="field">
            <label>Couverture (URL)</label>
            <input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              disabled={!isPending}
            />
          </div>
          <div className="field">
            <label>ISBN saisi</label>
            <input value={row.isbn ?? '—'} disabled />
          </div>
        </div>
      </div>

      <div className="field">
        <label>Motif (visible en cas de refus)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          disabled={!isPending}
        />
      </div>

      {error && (
        <div className="error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {isPending ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={() => decide('approve')} disabled={submitting !== null}>
            {submitting === 'approve' ? 'Approbation…' : 'Approuver et ajouter au catalogue'}
          </button>
          <button className="btn btn-danger" onClick={() => decide('reject')} disabled={submitting !== null}>
            {submitting === 'reject' ? 'Refus…' : 'Refuser'}
          </button>
          <button className="btn" onClick={archive} disabled={submitting !== null} style={{ marginLeft: 'auto' }}>
            {submitting === 'archive' ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 12, flex: 1 }}>
            {removed
              ? 'Ce livre a été approuvé puis supprimé du catalogue depuis l’onglet Livres.'
              : 'Soumission déjà traitée. Pour corriger le livre, passe par l’onglet Livres.'}
          </div>
          <button className="btn btn-danger" onClick={archive} disabled={submitting !== null}>
            {submitting === 'archive' ? 'Suppression…' : 'Supprimer la soumission'}
          </button>
        </div>
      )}
    </main>
  );
}
