function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      {direction === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

// Bande étroite affichée à la place de l'aside quand elle est repliée.
// Contient le bouton chevron pour la déplier, et optionnellement une liste
// scrollable d'items (miniatures cliquables).
export function CollapsedAsideStrip({
  onExpand,
  label,
  children,
}: {
  onExpand: () => void;
  label?: string;
  children?: React.ReactNode;
}) {
  const title = label ? `Déplier ${label}` : "Déplier";
  return (
    <aside
      style={{
        width: 48,
        flexShrink: 0,
        borderRight: "1px solid var(--line)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 12,
        paddingBottom: 12,
      }}>
      <button
        onClick={onExpand}
        title={title}
        aria-label={title}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          padding: 0,
          borderRadius: 6,
          border: "1px solid var(--line)",
          background: "transparent",
          color: "var(--ink-muted)",
          cursor: "pointer",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--surface-2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}>
        <ChevronIcon direction="right" />
      </button>
      {children && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "10px 0",
          }}>
          {children}
        </div>
      )}
    </aside>
  );
}

// Bouton miniature à utiliser dans `CollapsedAsideStrip` pour afficher l'image
// d'un item et permettre la sélection sans déplier.
export function CollapsedAsideItem({
  onClick,
  selected,
  title,
  dimmed,
  children,
}: {
  onClick: () => void;
  selected: boolean;
  title: string;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 38,
        padding: 0,
        borderRadius: 6,
        border: "1px solid",
        borderColor: selected ? "var(--accent)" : "transparent",
        background: selected ? "var(--surface-2)" : "transparent",
        cursor: "pointer",
        flexShrink: 0,
        overflow: "hidden",
        opacity: dimmed ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}>
      {children}
    </button>
  );
}

// Style à appliquer sur l'aside dépliée en mode mobile : la fait flotter
// au-dessus du body (70% de viewport, max 480px) avec un z-index élevé.
// L'aside est en `position: fixed`, donc retirée du flow flex parent.
export const MOBILE_ASIDE_OVERLAY_STYLE = {
  position: "fixed" as const,
  top: 0,
  left: 0,
  bottom: 0,
  height: "100vh",
  width: "70vw",
  maxWidth: 480,
  zIndex: 100,
  boxShadow: "0 0 32px rgba(0, 0, 0, 0.25)",
  animation: "admin-aside-slide-in 200ms ease-out",
  willChange: "transform",
};

// Backdrop semi-transparent affiché derrière l'aside en mode overlay mobile.
// Click → ferme l'aside.
export function MobileAsideBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        zIndex: 99,
        animation: "admin-aside-backdrop-fade-in 200ms ease-out",
      }}
    />
  );
}

// Petit bouton à insérer dans le header d'une aside dépliée pour la replier.
export function AsideCollapseButton({ onCollapse }: { onCollapse: () => void }) {
  return (
    <button
      onClick={onCollapse}
      title="Replier le panneau"
      aria-label="Replier le panneau"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        borderRadius: 6,
        border: "1px solid var(--line)",
        background: "transparent",
        color: "var(--ink-muted)",
        cursor: "pointer",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}>
      <ChevronIcon direction="left" />
    </button>
  );
}
