import { useEffect, useRef } from "react";
import type { AdminUserListItem } from "../lib/types";

export type UserListFilter = "premium" | "admin" | "active";
export const USER_FILTERS: UserListFilter[] = ["premium", "admin", "active"];
const FILTER_LABELS: Record<UserListFilter, string> = {
  premium: "Premium",
  admin: "Admin",
  active: "Actifs (30j)",
};

export type UserListSort = "activity" | "created" | "username";
const SORT_LABELS: Record<UserListSort, string> = {
  activity: "Récente activité",
  created: "Date d'inscription",
  username: "Username (A→Z)",
};
export const USER_SORTS: UserListSort[] = ["activity", "created", "username"];

type Props = {
  users: AdminUserListItem[];
  selectedUserId: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  activeFilters: Set<UserListFilter>;
  onToggleFilter: (f: UserListFilter) => void;
  sort: UserListSort;
  onSortChange: (s: UserListSort) => void;
  onSelect: (userId: string) => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  total: number;
};

const LOAD_MORE_THRESHOLD_PX = 200;

export function UserList({
  users,
  selectedUserId,
  query,
  onQueryChange,
  activeFilters,
  onToggleFilter,
  sort,
  onSortChange,
  onSelect,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  total,
}: Props) {
  const scrollerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onScroll() {
      if (!el || !hasMore || loadingMore) return;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < LOAD_MORE_THRESHOLD_PX) onLoadMore();
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <aside
      ref={scrollerRef}
      style={{
        width: 360,
        borderRight: "1px solid var(--line)",
        overflow: "auto",
        background: "var(--surface)",
      }}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          background: "var(--surface)",
          zIndex: 1,
        }}>
        <input
          type="search"
          placeholder="username, display name, email…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 10px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            fontSize: 13,
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 8,
          }}>
          {USER_FILTERS.map((f) => {
            const active = activeFilters.has(f);
            return (
              <button
                key={f}
                onClick={() => onToggleFilter(f)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid",
                  borderColor: active ? "var(--accent)" : "var(--line)",
                  background: active ? "var(--accent)" : "var(--surface)",
                  color: active ? "white" : "var(--ink)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}>
                {FILTER_LABELS[f]}
              </button>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 8,
            gap: 8,
          }}>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as UserListSort)}
            style={{
              flex: 1,
              padding: "4px 8px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--surface)",
              fontSize: 12,
            }}>
            {USER_SORTS.map((s) => (
              <option key={s} value={s}>
                Tri : {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          {loading
            ? "Chargement…"
            : `${users.length} affichés / ${total} total`}
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {users.map((u) => {
          const selected = selectedUserId === u.user_id;
          const name =
            u.username || u.display_name || u.email || "(anonyme)";
          const initials = initialsOf(name);
          return (
            <li
              key={u.user_id}
              onClick={() => onSelect(u.user_id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                cursor: "pointer",
                background: selected
                  ? "var(--surface-2)"
                  : "transparent",
                borderBottom: "1px solid var(--line)",
              }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--surface-3)",
                  border: "1px solid var(--line)",
                  overflow: "hidden",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink-muted)",
                }}>
                {u.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  initials
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: "hidden",
                  }}>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                    {name}
                  </span>
                  {u.is_premium ? (
                    <span title="Premium" style={miniChip("#d4a017")}>
                      P
                    </span>
                  ) : null}
                  {u.is_admin ? (
                    <span title="Admin" style={miniChip("var(--accent)")}>
                      A
                    </span>
                  ) : null}
                </div>
                <div
                  className="muted"
                  style={{
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                  {u.email ?? "—"}
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 10, marginTop: 2 }}>
                  {u.last_activity_at
                    ? formatRelative(u.last_activity_at)
                    : "jamais actif"}{" "}
                  · {u.books_count} livre{u.books_count > 1 ? "s" : ""}
                </div>
              </div>
            </li>
          );
        })}
        {!loading && users.length === 0 && (
          <li
            style={{ padding: 24, textAlign: "center" }}
            className="muted">
            Aucun utilisateur
          </li>
        )}
        {users.length > 0 && hasMore && (
          <li
            style={{ padding: 12, textAlign: "center", fontSize: 11 }}
            className="muted">
            {loadingMore ? "Chargement…" : `${users.length} / ${total}`}
          </li>
        )}
        {users.length > 0 && !hasMore && (
          <li
            style={{ padding: 12, textAlign: "center", fontSize: 11 }}
            className="muted">
            Fin · {total} utilisateur{total > 1 ? "s" : ""}
          </li>
        )}
      </ul>
    </aside>
  );
}

function miniChip(bg: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: bg,
    color: "white",
    fontSize: 9,
    fontWeight: 700,
    flexShrink: 0,
  };
}

function initialsOf(name: string): string {
  const parts = name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return parts || "?";
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const diffMs = Date.now() - ts;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  return new Date(iso).toLocaleDateString();
}
