import { CATALOG_AVAILABILITY_LABELS, type CatalogAvailability } from '../../lib/types';

// Pastille compacte affichée dans les *-list pour signaler le mode d'accès
// d'un item (everyone / premium / badge / unit). `everyone` est mis en
// avant (couleur accent) car c'est le mode "ouvert à tous" ; les autres
// modes utilisent une teinte neutre/distincte pour rester lisibles dans
// la liste sans surcharger.
export function AvailabilityBadge({ availability }: { availability: CatalogAvailability }) {
  if (availability === 'everyone') {
    return (
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
    );
  }
  const palette: Record<Exclude<CatalogAvailability, 'everyone'>, { bg: string; fg: string; label: string }> = {
    premium: { bg: '#f59e0b', fg: 'white', label: 'PREMIUM' },
    badge: { bg: 'var(--surface-2)', fg: 'var(--ink-muted)', label: 'BADGE' },
    unit: { bg: 'var(--surface-2)', fg: 'var(--ink-muted)', label: 'UNITÉ' },
  };
  const p = palette[availability];
  return (
    <span
      title={CATALOG_AVAILABILITY_LABELS[availability]}
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: 4,
        background: p.bg,
        color: p.fg,
      }}>
      {p.label}
    </span>
  );
}
