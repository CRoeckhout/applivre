import { BadgeGraphicWeb } from '../lib/badge-graphic';
import type { BadgeCatalogRow } from '../lib/types';

type Props = {
  badges: BadgeCatalogRow[];
  selectedKey: string | null;
  filter: 'all' | 'active' | 'retired';
  onFilterChange: (f: 'all' | 'active' | 'retired') => void;
  onSelect: (key: string) => void;
  onNew: () => void;
};

export function BadgeList({
  badges,
  selectedKey,
  filter,
  onFilterChange,
  onSelect,
  onNew,
}: Props) {
  const now = new Date();
  const filtered = badges.filter((b) => {
    if (filter === 'retired') return b.retired_at !== null;
    const isActive =
      b.retired_at === null &&
      (b.active_from === null || new Date(b.active_from) <= now) &&
      (b.active_until === null || new Date(b.active_until) >= now);
    if (filter === 'active') return isActive;
    return true;
  });

  return (
    <aside style={{ width: 320, borderRight: '1px solid var(--line)', overflow: 'auto', background: 'white' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
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
          const selected = selectedKey === b.badge_key;
          return (
            <li
              key={b.badge_key}
              onClick={() => onSelect(b.badge_key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                background: selected ? '#f5f0ea' : 'transparent',
                borderBottom: '1px solid var(--line)',
                opacity: isRetired ? 0.6 : 1,
              }}>
              <BadgeGraphicWeb
                kind={b.graphic_kind}
                payload={b.graphic_payload}
                tokens={b.graphic_tokens ?? {}}
                size={40}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.title}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {b.badge_key}
                </div>
              </div>
              {isRetired && <span className="tag tag-retired">Retiré</span>}
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li style={{ padding: 24, textAlign: 'center' }} className="muted">Aucun badge</li>
        )}
      </ul>
    </aside>
  );
}
