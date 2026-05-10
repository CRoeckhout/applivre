import { useEffect, useRef, useState } from "react";

const MOBILE_QUERY = "(max-width: 768px)";

// Hook réutilisable : true quand le viewport est ≤ 768px (mobile/tablette
// portrait). Réagit au resize.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    return window.matchMedia?.(MOBILE_QUERY).matches ?? false;
  });
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

// État partagé entre toutes les asides de section (utilisateurs, badges,
// cadres, etc.). On garde une seule clé localStorage et un module-level state
// avec abonnés : toggler une aside met à jour toutes les autres dans le même
// onglet (les hooks `useState` locaux n'observent pas localStorage).
const ASIDES_STORAGE_KEY = "admin-asides-collapsed";

function readInitialCollapsed(): boolean {
  const saved = localStorage.getItem(ASIDES_STORAGE_KEY);
  if (saved === "1") return true;
  if (saved === "0") return false;
  return window.matchMedia?.(MOBILE_QUERY).matches ?? false;
}

let sharedCollapsed = readInitialCollapsed();
const subscribers = new Set<(value: boolean) => void>();

function setSharedCollapsed(next: boolean) {
  if (sharedCollapsed === next) return;
  sharedCollapsed = next;
  localStorage.setItem(ASIDES_STORAGE_KEY, next ? "1" : "0");
  for (const sub of subscribers) sub(next);
}

// Hook pour les asides pliables. État partagé via module-level state +
// localStorage. Sur mobile (≤ 768px) sans préférence enregistrée, l'aside est
// repliée par défaut. Renvoie isMobile pour appliquer le mode overlay.
export function useCollapsibleAside(): [boolean, () => void, boolean] {
  const isMobile = useIsMobile();
  const [collapsed, setLocalCollapsed] = useState<boolean>(sharedCollapsed);

  useEffect(() => {
    subscribers.add(setLocalCollapsed);
    // Sync au mount au cas où la valeur partagée a changé entre l'init du
    // useState et l'effect (StrictMode double-mount, etc.).
    setLocalCollapsed(sharedCollapsed);
    return () => {
      subscribers.delete(setLocalCollapsed);
    };
  }, []);

  function toggle() {
    setSharedCollapsed(!sharedCollapsed);
  }

  // Auto-déploiement quand on passe de mobile → desktop : sur grand écran on
  // a la place pour l'aside dépliée, on l'ouvre sans toucher la préférence
  // pour quand on rebascule en mobile.
  const prevIsMobile = useRef(isMobile);
  useEffect(() => {
    if (prevIsMobile.current && !isMobile) {
      setSharedCollapsed(false);
    }
    prevIsMobile.current = isMobile;
  }, [isMobile]);

  return [collapsed, toggle, isMobile];
}
