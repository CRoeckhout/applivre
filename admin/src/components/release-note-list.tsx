import type { ReleaseNoteRow } from '../lib/types';
import { useCollapsibleAside } from '../lib/use-collapsible-aside';
import {
  AsideCollapseButton,
  CollapsedAsideItem,
  CollapsedAsideStrip,
  MOBILE_ASIDE_OVERLAY_STYLE,
  MobileAsideBackdrop,
} from './collapsible-aside';

type Props = {
  notes: ReleaseNoteRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function ReleaseNoteList({ notes, selectedId, onSelect, onNew }: Props) {
  const [collapsed, toggleCollapsed, isMobile] = useCollapsibleAside();
  const now = new Date();

  function renderCollapsedItems() {
    return notes.map((n) => (
      <CollapsedAsideItem
        key={n.id}
        onClick={() => onSelect(n.id)}
        selected={selectedId === n.id}
        dimmed={new Date(n.published_at) > now}
        title={`v${n.version}`}>
        <div style={{ fontSize: 10, fontWeight: 700, textAlign: 'center' }}>
          v{n.version}
        </div>
      </CollapsedAsideItem>
    ));
  }

  if (collapsed) {
    return (
      <CollapsedAsideStrip onExpand={toggleCollapsed} label="release notes">
        {renderCollapsedItems()}
      </CollapsedAsideStrip>
    );
  }

  return (
    <>
      {isMobile && (
        <CollapsedAsideStrip onExpand={toggleCollapsed} label="release notes">
          {renderCollapsedItems()}
        </CollapsedAsideStrip>
      )}
      {isMobile && <MobileAsideBackdrop onClose={toggleCollapsed} />}
      <aside
        style={{
          width: 320,
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <AsideCollapseButton onCollapse={toggleCollapsed} />
            <button className="btn btn-primary" onClick={onNew}>
              + Nouvelle note
            </button>
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {notes.map((n) => {
            const isScheduled = new Date(n.published_at) > now;
            const selected = selectedId === n.id;
            return (
              <li
                key={n.id}
                onClick={() => onSelect(n.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: selected ? 'var(--surface-2)' : 'transparent',
                  borderBottom: '1px solid var(--line)',
                  opacity: isScheduled ? 0.6 : 1,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                    {n.title}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    v{n.version} · {formatDate(n.published_at)}
                  </div>
                </div>
                {isScheduled && <span className="tag">Programmée</span>}
              </li>
            );
          })}
          {notes.length === 0 && (
            <li style={{ padding: 24, textAlign: 'center' }} className="muted">
              Aucune note
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
