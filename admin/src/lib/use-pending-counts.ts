import { useEffect, useState } from "react";
import {
  getPendingBookSubmissionsCount,
  getProposedPillsCount,
  getUnreadReportsCount,
} from "./admin-queries";

// Compteurs affichés en badge dans la sidebar : pills "proposed",
// signalements non vus, livres soumis "pending". Fetch initial ici, puis les
// sections concernées re-pushent la valeur via les setters exposés.
export function usePendingCounts(enabled: boolean) {
  const [proposedPills, setProposedPills] = useState(0);
  const [pendingReports, setPendingReports] = useState(0);
  const [pendingBookSubmissions, setPendingBookSubmissions] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Pas critique si un fetch échoue : la section re-pushera la valeur
    // à la prochaine navigation.
    const load = (fetch: () => Promise<number>, set: (n: number) => void) =>
      fetch().then(
        (n) => {
          if (!cancelled) set(n);
        },
        () => {},
      );
    void load(getProposedPillsCount, setProposedPills);
    void load(getUnreadReportsCount, setPendingReports);
    void load(getPendingBookSubmissionsCount, setPendingBookSubmissions);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    proposedPills,
    pendingReports,
    pendingBookSubmissions,
    setProposedPills,
    setPendingReports,
    setPendingBookSubmissions,
  };
}
