import { useEffect, useRef, useState } from "react";
import { UserDetail } from "../components/user-detail";
import {
  USER_FILTERS,
  UserList,
  type UserListFilter,
  type UserListSort,
} from "../components/user-list";
import { supabase } from "../lib/supabase";
import type { AdminUserListItem } from "../lib/types";

const PAGE_SIZE = 50;

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function UsersSection({ itemId, onItemChange }: Props) {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<UserListFilter>>(
    new Set(),
  );
  const [sort, setSort] = useState<UserListSort>("activity");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [directFetched, setDirectFetched] = useState<AdminUserListItem | null>(
    null,
  );

  const queryTimer = useRef<number | null>(null);
  const loadIdRef = useRef(0);

  useEffect(() => {
    if (queryTimer.current) window.clearTimeout(queryTimer.current);
    queryTimer.current = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => {
      if (queryTimer.current) window.clearTimeout(queryTimer.current);
    };
  }, [query]);

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, activeFilters, sort]);

  // Si l'userId de l'URL n'est pas dans la liste filtrée courante, fetch
  // direct via admin_user_card pour pouvoir hydrater le détail malgré tout.
  useEffect(() => {
    if (!itemId) {
      setDirectFetched(null);
      return;
    }
    if (users.some((u) => u.user_id === itemId)) {
      setDirectFetched(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.rpc("admin_user_card", {
        p_user_id: itemId,
      });
      if (cancelled) return;
      const row = (data ?? [])[0];
      if (!row) {
        setDirectFetched(null);
        return;
      }
      setDirectFetched({
        user_id: row.user_id,
        email: row.email,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        is_premium: false,
        is_admin: false,
        account_created_at: row.account_created_at,
        last_activity_at: null,
        books_count: 0,
        sheets_count: 0,
        total_count: 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, users]);

  async function load(append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError(null);

    const myId = ++loadIdRef.current;

    const offset = append ? users.length : 0;

    const { data, error } = await supabase.rpc("admin_users_list", {
      p_search: debouncedQuery.length > 0 ? debouncedQuery : null,
      p_only_premium: activeFilters.has("premium"),
      p_only_admin: activeFilters.has("admin"),
      p_only_active: activeFilters.has("active"),
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

    if (myId !== loadIdRef.current) return;
    if (append) setLoadingMore(false);
    else setLoading(false);

    if (error) {
      setLoadError(error.message);
      return;
    }
    const rows = (data ?? []) as AdminUserListItem[];
    setUsers((prev) => (append ? [...prev, ...rows] : rows));
    setTotal(rows[0]?.total_count ?? (append ? total : 0));
  }

  function loadMore() {
    if (loading || loadingMore) return;
    if (users.length >= total) return;
    void load(true);
  }

  function toggleFilter(f: UserListFilter) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  const selected =
    (itemId
      ? users.find((u) => u.user_id === itemId) ?? null
      : null) ??
    (directFetched && directFetched.user_id === itemId
      ? directFetched
      : null);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <UserList
        users={users}
        selectedUserId={itemId}
        query={query}
        onQueryChange={setQuery}
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
        sort={sort}
        onSortChange={setSort}
        onSelect={onItemChange}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={users.length < total}
        onLoadMore={loadMore}
        total={total}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}>
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Erreur : {loadError}
          </div>
        )}
        {itemId ? (
          <UserDetail listItem={selected} userId={itemId} key={itemId} />
        ) : (
          <main
            style={{ flex: 1, padding: 40, textAlign: "center" }}
            className="muted">
            Sélectionne un utilisateur à gauche.
            {USER_FILTERS.length > 0 ? (
              <div style={{ fontSize: 12, marginTop: 8 }}>
                Astuce : la recherche couvre username, display name et email.
              </div>
            ) : null}
          </main>
        )}
      </div>
    </div>
  );
}
