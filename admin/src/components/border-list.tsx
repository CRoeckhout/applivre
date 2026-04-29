import { SUPABASE_URL } from '../lib/supabase';
import type { BorderCatalogRow } from '../lib/types';

type Props = {
  borders: BorderCatalogRow[];
  selectedKey: string | null;
  filter: 'all' | 'active' | 'retired';
  onFilterChange: (f: 'all' | 'active' | 'retired') => void;
  onSelect: (key: string) => void;
  onNew: () => void;
};

export function BorderList({
  borders,
  selectedKey,
  filter,
  onFilterChange,
  onSelect,
  onNew,
}: Props) {
  const now = new Date();
  const filtered = borders.filter((b) => {
    if (filter === 'retired') return b.retired_at !== null;
    const isActive =
      b.retired_at === null &&
      (b.active_from === null || new Date(b.active_from) <= now) &&
      (b.active_until === null || new Date(b.active_until) >= now);
    if (filter === 'active') return isActive;
    return true;
  });

  return (
    <aside style={{ width: 320, borderRight: '1px solid var(--line)', overflow: 'auto', background: 'var(--surface)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="btn btn-primary" onClick={onNew}>+ Nouveau</button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'active', 'retired'] as const).map((f) => (
            <button
              key={f}
              className="btn"
              style={filter === f ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}}
              onClick={() => onFilterChange(f)}>
              {f === 'all' ? 'Tous' : f === 'active' ? 'Actifs' : 'Retirés'}
            </button>
          ))}
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {filtered.map((b) => {
          const isRetired = b.retired_at !== null;
          const selected = selectedKey === b.border_key;
          const thumbUrl = b.storage_path
            ? `${SUPABASE_URL}/storage/v1/object/public/border-graphics/${b.storage_path}`
            : null;
          return (
            <li
              key={b.border_key}
              onClick={() => onSelect(b.border_key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                background: selected ? 'var(--surface-2)' : 'transparent',
                borderBottom: '1px solid var(--line)',
                opacity: isRetired ? 0.6 : 1,
              }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'var(--surface-3)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt=""
                    style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
                  />
                ) : (
                  <span className="muted" style={{ fontSize: 10 }}>?</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.title}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {b.border_key}
                </div>
              </div>
              {b.is_default && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'var(--accent)',
                    color: 'white',
                  }}>
                  DISPO
                </span>
              )}
              {isRetired && <span className="tag tag-retired">Retiré</span>}
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li style={{ padding: 24, textAlign: 'center' }} className="muted">Aucun cadre</li>
        )}
      </ul>
    </aside>
  );
}
