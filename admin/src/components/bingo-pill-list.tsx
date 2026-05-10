import {
  BINGO_PILL_STATUS_LABELS,
  BINGO_PILL_STATUSES,
  type BingoPillRow,
  type BingoPillStatus,
} from '../lib/types';
import { useCollapsibleAside } from '../lib/use-collapsible-aside';
import {
  AsideCollapseButton,
  CollapsedAsideStrip,
  MOBILE_ASIDE_OVERLAY_STYLE,
  MobileAsideBackdrop,
} from './collapsible-aside';

export type BingoPillStatusFilter = BingoPillStatus | 'all';

type Props = {
  pills: BingoPillRow[];
  selectedId: string | null;
  search: string;
  onSearchChange: (s: string) => void;
  statusFilter: BingoPillStatusFilter;
  onStatusFilterChange: (s: BingoPillStatusFilter) => void;
  statusCounts: Record<BingoPillStatus, number>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (pill: BingoPillRow) => void;
  deletingId: string | null;
};

const STATUS_COLORS: Record<BingoPillStatus, string> = {
  private: '#94a3b8',
  proposed: '#f59e0b',
  public: '#34d399',
  disabled: '#ef4444',
};

const STATUS_ICONS: Record<BingoPillStatus, string> = {
  private: '·',
  proposed: '⏳',
  public: '✓',
  disabled: '🚫',
};

export function BingoPillList({
  pills,
  selectedId,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  onSelect,
  onNew,
  onDelete,
  deletingId,
}: Props) {
  const [collapsed, toggleCollapsed, isMobile] = useCollapsibleAside();
  const q = search.trim().toLowerCase();
  const byStatus =
    statusFilter === 'all'
      ? pills
      : pills.filter((p) => p.status === statusFilter);
  const filtered = q
    ? byStatus.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.user_id.toLowerCase().includes(q),
      )
    : byStatus;

  if (collapsed) {
    return <CollapsedAsideStrip onExpand={toggleCollapsed} label="défis bingo" />;
  }

  return (
    <>
      {isMobile && <CollapsedAsideStrip onExpand={toggleCollapsed} label="défis bingo" />}
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
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 8,
          }}>
          <FilterPill
            label={`Tous · ${pills.length}`}
            active={statusFilter === 'all'}
            onClick={() => onStatusFilterChange('all')}
          />
          {BINGO_PILL_STATUSES.map((s) => (
            <FilterPill
              key={s}
              label={`${BINGO_PILL_STATUS_LABELS[s]} · ${statusCounts[s]}`}
              color={STATUS_COLORS[s]}
              active={statusFilter === s}
              onClick={() => onStatusFilterChange(s)}
            />
          ))}
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
          {filtered.length} affiché(s)
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
              }}>
              <span
                title={BINGO_PILL_STATUS_LABELS[p.status]}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: STATUS_COLORS[p.status],
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                {STATUS_ICONS[p.status]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
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
                  }}>
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
                }}>
                {deleting ? '…' : '×'}
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
    </>
  );
}

function FilterPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 999,
        border: '1px solid',
        borderColor: active ? color ?? 'var(--accent)' : 'var(--line)',
        background: active ? color ?? 'var(--accent)' : 'var(--surface)',
        color: active ? 'white' : 'var(--ink)',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}>
      {label}
    </button>
  );
}
