import { EDITORIAL_KIND_LABELS, type EditorialPostKind } from '../lib/types';

// Pastille colorée du type de publication éditoriale, une couleur par type.
// Fond teinté translucide + texte coloré : lisible sur les thèmes clair comme
// sombre de l'admin (pas de fond opaque qui jurerait selon le thème).
const KIND_COLORS: Record<EditorialPostKind, string> = {
  announcement: '#3b82f6', // bleu
  partner: '#8b5cf6', // violet
  featured_review: '#f59e0b', // ambre
  book_of_month: '#10b981', // émeraude
  featured_sheet: '#ec4899', // rose
};

export function EditorialKindPill({ kind }: { kind: EditorialPostKind }) {
  const color = KIND_COLORS[kind];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        color,
        background: `${color}26`, // ~15% d'opacité (26 hex)
      }}>
      {EDITORIAL_KIND_LABELS[kind]}
    </span>
  );
}
