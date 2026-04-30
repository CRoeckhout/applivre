import type { BingoPillRow } from '../lib/types';

type Props = {
  pills: BingoPillRow[];
  selectedId: string | null;
  search: string;
  onSearchChange: (s: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (pill: BingoPillRow) => void;
  deletingId: string | null;
};

export function BingoPillList({
  pills,
  selectedId,
  search,
  onSearchChange,
  onSelect,
  onNew,
  onDelete,
  deletingId,
}: Props) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? pills.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.user_id.toLowerCase().includes(q),
      )
    : pills;

  return (
    <aside
      style={{
        width: 360,
        borderRight: '1px solid var(--line)',
        overflow: 'auto',
        background: 'var(--surface)',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          background: 'var(--surface)',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="btn btn-primary" onClick={onNew}>
            + Nouveau
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filtrer (label ou user_id)"
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            fontSize: 13,
          }}
        />
        <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
          {filtered.length} / {pills.length} défi(s)
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {filtered.map((p) => {
          const selected = selectedId === p.id;
          const deleting = deletingId === p.id;
          return (
            <li
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                background: selected ? 'var(--surface-2)' : 'transparent',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label}
                </div>
                <div
                  className="muted"
                  style={{
                    fontSize: 11,
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.user_id}
                </div>
              </div>
              <button
                className="btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p);
                }}
                disabled={deleting}
                title="Supprimer"
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  color: '#dc2626',
                  flexShrink: 0,
                }}
              >
                {deleting ? '…' : 'Supprimer'}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li style={{ padding: 24, textAlign: 'center' }} className="muted">
            Aucun défi
          </li>
        )}
      </ul>
    </aside>
  );
}
