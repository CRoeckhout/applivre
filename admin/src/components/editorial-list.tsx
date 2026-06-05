import {
  EDITORIAL_STATUS_LABELS,
  type EditorialPostRow,
} from '../lib/types';
import { EditorialKindPill } from './editorial-kind-pill';
import { useCollapsibleAside } from '../lib/use-collapsible-aside';
import {
  AsideCollapseButton,
  CollapsedAsideItem,
  CollapsedAsideStrip,
  MOBILE_ASIDE_OVERLAY_STYLE,
  MobileAsideBackdrop,
} from './collapsible-aside';

type Props = {
  posts: EditorialPostRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onCandidates: () => void;
};

export function EditorialList({ posts, selectedId, onSelect, onNew, onCandidates }: Props) {
  const [collapsed, toggleCollapsed, isMobile] = useCollapsibleAside();

  function renderCollapsedItems() {
    return posts.map((p) => (
      <CollapsedAsideItem
        key={p.id}
        onClick={() => onSelect(p.id)}
        selected={selectedId === p.id}
        dimmed={p.status !== 'published'}
        title={p.title}>
        <div style={{ fontSize: 14, textAlign: 'center' }}>{p.pinned ? '★' : '•'}</div>
      </CollapsedAsideItem>
    ));
  }

  if (collapsed) {
    return (
      <CollapsedAsideStrip onExpand={toggleCollapsed} label="fil d'actualité">
        {renderCollapsedItems()}
      </CollapsedAsideStrip>
    );
  }

  return (
    <>
      {isMobile && (
        <CollapsedAsideStrip onExpand={toggleCollapsed} label="fil d'actualité">
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
              + Nouvelle publication
            </button>
          </div>
          <button
            className="btn"
            style={{ marginTop: 8, width: '100%' }}
            onClick={onCandidates}>
            ✨ Candidats du mois
          </button>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {posts.map((p) => {
            const selected = selectedId === p.id;
            const isScheduled =
              p.status === 'published' && new Date(p.publish_at) > new Date();
            return (
              <li
                key={p.id}
                onClick={() => onSelect(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: selected ? 'var(--surface-2)' : 'transparent',
                  borderBottom: '1px solid var(--line)',
                  opacity: p.status === 'published' ? 1 : 0.6,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                    {p.pinned && <span title="Épinglé">★</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.title}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 3,
                    }}>
                    <EditorialKindPill kind={p.kind} />
                    <span className="muted" style={{ fontSize: 11 }}>
                      {formatDate(p.publish_at)}
                    </span>
                  </div>
                </div>
                {isScheduled ? (
                  <span className="tag">Programmé</span>
                ) : p.status !== 'published' ? (
                  <span className="tag">{EDITORIAL_STATUS_LABELS[p.status]}</span>
                ) : null}
              </li>
            );
          })}
          {posts.length === 0 && (
            <li style={{ padding: 24, textAlign: 'center' }} className="muted">
              Aucune publication
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
