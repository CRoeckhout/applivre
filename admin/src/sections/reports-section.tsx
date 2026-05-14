import { useCallback, useEffect, useState } from "react";
import { ReportDetail } from "../components/report-detail";
import {
  getModerationQueue,
  type ModerationQueueFilter,
  type ModerationQueueRow,
} from "../lib/admin-queries";

const FILTER_STORAGE_KEY = "admin-reports-filter";

function readPersistedFilter(): ModerationQueueFilter {
  try {
    const v = localStorage.getItem(FILTER_STORAGE_KEY);
    if (v === "pending" || v === "all" || v === "closed") return v;
  } catch {
    // ignore
  }
  return "pending";
}

const FILTER_LABELS: Record<ModerationQueueFilter, string> = {
  pending: "En attente",
  all: "Tous",
  closed: "Traités",
};

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
  // Push le count "pending" vers App.tsx pour rafraîchir le badge sidebar
  // sans round-trip RPC dédié à chaque action de modération.
  onPendingCountChange?: (count: number) => void;
};

export function ReportsSection({
  itemId,
  onItemChange,
  onPendingCountChange,
}: Props) {
  const [queue, setQueue] = useState<ModerationQueueRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilterState] = useState<ModerationQueueFilter>(() =>
    readPersistedFilter(),
  );

  const setFilter = (next: ModerationQueueFilter) => {
    setFilterState(next);
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await getModerationQueue(filter);
      setQueue(rows);
      // Le count "non vu" pour le badge sidebar reste toujours basé sur
      // pending_count (pas le filtre courant) — on resomme ce qu'on a sous
      // la main, c'est cohérent vu que le filtre 'pending' montre tous les
      // pending et qu'on dépend du re-fetch périodique sinon.
      if (filter === "pending" || filter === "all") {
        const pending = rows.reduce(
          (acc, r) => acc + Number(r.pending_count),
          0,
        );
        onPendingCountChange?.(pending);
      }
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, onPendingCountChange]);

  // Re-fetch la queue à chaque changement de filtre. Le badge sidebar
  // décrémente uniquement quand l'admin moderate (status pending →
  // actioned/dismissed), pas à la simple ouverture.
  useEffect(() => {
    void load();
  }, [load]);

  const selected = itemId
    ? (queue.find((q) => q.owner_id === itemId) ?? null)
    : null;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <aside
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: "1px solid var(--line)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <header
          style={{
            padding: "14px 16px 10px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Signalements</span>
            {queue.length > 0 ? (
              <span
                style={{
                  fontWeight: 400,
                  fontSize: 12,
                  color: "var(--ink-muted)",
                }}
              >
                · {queue.length} util.
              </span>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              gap: 4,
              background: "var(--surface-2)",
              padding: 2,
              borderRadius: 6,
            }}
          >
            {(["pending", "all", "closed"] as ModerationQueueFilter[]).map(
              (f) => {
                const active = filter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      flex: 1,
                      padding: "5px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: "none",
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "white" : "var(--ink-muted)",
                      cursor: "pointer",
                    }}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                );
              },
            )}
          </div>
        </header>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {loadError ? (
            <div className="error" style={{ padding: 12 }}>
              {loadError}
            </div>
          ) : null}
          {loading && queue.length === 0 ? (
            <div className="muted" style={{ padding: 20, textAlign: "center" }}>
              Chargement…
            </div>
          ) : queue.length === 0 ? (
            <div className="muted" style={{ padding: 20, textAlign: "center" }}>
              Aucun signalement.
            </div>
          ) : (
            queue.map((row) => {
              const isActive = row.owner_id === itemId;
              const label = row.username
                ? `@${row.username}`
                : (row.display_name ?? "Anonyme");
              return (
                <button
                  key={row.owner_id}
                  onClick={() => onItemChange(row.owner_id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 14px",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid var(--line)",
                    background: isActive ? "var(--accent-pale)" : "transparent",
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      e.currentTarget.style.background = "var(--surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      overflow: "hidden",
                      background: "var(--surface-2)",
                      flexShrink: 0,
                    }}
                  >
                    {row.avatar_url ? (
                      <img
                        src={row.avatar_url}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </span>
                      {row.is_banned ? (
                        <span
                          style={{
                            background: "#ef4444",
                            color: "white",
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 999,
                          }}
                        >
                          BANNI
                        </span>
                      ) : null}
                    </div>
                    <div
                      style={{ fontSize: 11, color: "var(--ink-muted)" }}
                    >
                      {row.total_count} signalement
                      {row.total_count > 1 ? "s" : ""}
                      {row.pending_count > 0
                        ? ` · ${row.pending_count} en attente`
                        : ""}
                    </div>
                  </div>
                  {row.pending_count > 0 ? (
                    <span
                      style={{
                        background: "#ef4444",
                        color: "white",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {row.pending_count}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {selected ? (
          <ReportDetail
            ownerId={selected.owner_id}
            ownerLabel={
              selected.username
                ? `@${selected.username}`
                : (selected.display_name ?? "Anonyme")
            }
            ownerIsBanned={selected.is_banned}
            onModerated={() => void load()}
          />
        ) : (
          <main
            style={{ flex: 1, padding: 40, textAlign: "center" }}
            className="muted"
          >
            Sélectionne un utilisateur à gauche pour voir ses signalements.
          </main>
        )}
      </div>
    </div>
  );
}
