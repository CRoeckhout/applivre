import { useEffect, useState } from "react";
import { BadgeForm } from "../components/badge-form";
import { BadgeList } from "../components/badge-list";
import { supabase } from "../lib/supabase";
import type { BadgeCatalogRow } from "../lib/types";

export function BadgesSection() {
  const [badges, setBadges] = useState<BadgeCatalogRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "retired">("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from("badge_catalog")
      .select("*")
      .order("badge_key", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setBadges((data ?? []) as BadgeCatalogRow[]);
  }

  function onSaved(saved: BadgeCatalogRow) {
    setBadges((prev) => {
      const idx = prev.findIndex((b) => b.badge_key === saved.badge_key);
      if (idx === -1)
        return [...prev, saved].sort((a, b) =>
          a.badge_key.localeCompare(b.badge_key),
        );
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    setSelectedKey(saved.badge_key);
    setCreating(false);
  }

  function onDeleted(key: string) {
    void load();
    setSelectedKey(key);
    setCreating(false);
  }

  const selected = creating
    ? null
    : (badges.find((b) => b.badge_key === selectedKey) ?? null);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <BadgeList
        badges={badges}
        selectedKey={creating ? null : selectedKey}
        filter={filter}
        onFilterChange={setFilter}
        onSelect={(k) => {
          setSelectedKey(k);
          setCreating(false);
        }}
        onNew={() => {
          setCreating(true);
          setSelectedKey(null);
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Load error: {loadError}
          </div>
        )}
        {selected || creating ? (
          <BadgeForm
            initial={selected}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <main
            style={{ flex: 1, padding: 40, textAlign: "center" }}
            className="muted"
          >
            Sélectionne un badge à gauche ou crée-en un nouveau.
          </main>
        )}
      </div>
    </div>
  );
}
