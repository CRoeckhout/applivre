import { SUPABASE_URL } from '../lib/supabase';
import type { StickerCatalogRow } from '../lib/types';
import { AvailabilityBadge } from './decoration-fields';

type Props = {
  stickers: StickerCatalogRow[];
  selectedKey: string | null;
  filter: 'all' | 'active' | 'retired';
  onFilterChange: (f: 'all' | 'active' | 'retired') => void;
  onSelect: (key: string) => void;
  onNew: () => void;
};

export function StickerList({
  stickers,
  selectedKey,
  filter,
  onFilterChange,
  onSelect,
  onNew,
}: Props) {
  const now = new Date();
  const filtered = stickers.filter((s) => {
    if (filter === 'retired') return s.retired_at !== null;
    const isActive =
      s.retired_at === null &&
      (s.active_from === null || new Date(s.active_from) <= now) &&
      (s.active_until === null || new Date(s.active_until) >= now);
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
          {(['all', 'active', 'retired'] as const).map((k) => (
            <button
              key={k}
              className="btn"
              style={filter === k ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}}
              onClick={() => onFilterChange(k)}>
              {k === 'all' ? 'Tous' : k === 'active' ? 'Actifs' : 'Retirés'}
            </button>
          ))}
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {filtered.map((s) => {
          const isRetired = s.retired_at !== null;
          const selected = selectedKey === s.sticker_key;
          const thumbUrl = s.storage_path
            ? `${SUPABASE_URL}/storage/v1/object/public/sticker-graphics/${s.storage_path}`
            : null;
          // Pour les SVG inline, on construit une data-URL pour la thumb.
          const inlineSvgUrl =
            !thumbUrl && s.kind === 'svg' && s.payload
              ? `data:image/svg+xml;utf8,${encodeURIComponent(s.payload)}`
              : null;
          const previewSrc = thumbUrl ?? inlineSvgUrl;
          return (
            <li
              key={s.sticker_key}
              onClick={() => onSelect(s.sticker_key)}
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
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <span className="muted" style={{ fontSize: 10 }}>?</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {s.sticker_key}
                </div>
              </div>
              <AvailabilityBadge availability={s.availability} />
              {isRetired && <span className="tag tag-retired">Retiré</span>}
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li style={{ padding: 24, textAlign: 'center' }} className="muted">Aucun sticker</li>
        )}
      </ul>
    </aside>
  );
}
