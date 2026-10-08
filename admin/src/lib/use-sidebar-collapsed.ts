import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "./use-collapsible-aside";

const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed";

function readInitialCollapsed(): boolean {
  const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (saved === "1") return true;
  if (saved === "0") return false;
  return window.matchMedia?.("(max-width: 768px)").matches ?? false;
}

// Sidebar principale repliée/dépliée, persistée en localStorage. Sur mobile
// la sidebar dépliée passe en overlay (`overlay` = true). En repassant en
// desktop on la redéplie d'office.
export function useSidebarCollapsed() {
  const [collapsed, setCollapsedState] = useState<boolean>(() =>
    readInitialCollapsed(),
  );
  const isMobile = useIsMobile();
  const prevIsMobile = useRef(isMobile);

  function setCollapsed(next: boolean) {
    setCollapsedState(next);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  }

  useEffect(() => {
    if (prevIsMobile.current && !isMobile) setCollapsed(false);
    prevIsMobile.current = isMobile;
  }, [isMobile]);

  return {
    collapsed,
    overlay: isMobile && !collapsed,
    toggle: () => setCollapsed(!collapsed),
    // Sur mobile, referme l'overlay (ex. après navigation).
    closeOverlay: () => {
      if (isMobile && !collapsed) setCollapsed(true);
    },
  };
}
