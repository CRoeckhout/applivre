import { useEffect, useState } from "react";
import { DEFAULT_TAB, isTab, type Tab } from "../tabs";

export type Route = { tab: Tab; itemId: string | null };

function readRouteFromHash(): Route {
  // Format : `#/<tab>` ou `#/<tab>/<itemId>`. ItemId encodé URL.
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [tabRaw, ...rest] = raw.split("/");
  const tab = isTab(tabRaw) ? tabRaw : DEFAULT_TAB;
  const idRaw = rest.join("/");
  const itemId = idRaw.length > 0 ? safeDecode(idRaw) : null;
  return { tab, itemId };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function buildHash({ tab, itemId }: Route): string {
  return itemId ? `#/${tab}/${encodeURIComponent(itemId)}` : `#/${tab}`;
}

// Route courante (onglet + item sélectionné) synchronisée avec le hash de
// l'URL. `replaceState` plutôt que `pushState` : on ne pollue pas
// l'historique à chaque clic dans une liste.
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => readRouteFromHash());

  useEffect(() => {
    const onHash = () => setRoute(readRouteFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function navigate(next: Route) {
    setRoute(next);
    const hash = buildHash(next);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }

  function selectTab(tab: Tab) {
    if (route.tab === tab) return;
    navigate({ tab, itemId: null });
  }

  function selectItem(itemId: string | null) {
    if (route.itemId === itemId) return;
    navigate({ tab: route.tab, itemId });
  }

  return { route, selectTab, selectItem };
}
