import { useEffect, useState } from "react";
import { BorderForm } from "../components/border-form";
import { BorderList } from "../components/border-list";
import { supabase } from "../lib/supabase";
import type { BorderCatalogRow } from "../lib/types";

export function BordersSection() {
  const [borders, setBorders] = useState<BorderCatalogRow[]>([]);
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
      .from("border_catalog")
      .select("*")
      .order("border_key", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setBorders((data ?? []) as BorderCatalogRow[]);
  }

  function onSaved(saved: BorderCatalogRow) {
    setBorders((prev) => {
      const idx = prev.findIndex((b) => b.border_key === saved.border_key);
      if (idx === -1)
        return [...prev, saved].sort((a, b) =>
          a.border_key.localeCompare(b.border_key),
        );
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    setSelectedKey(saved.border_key);
    setCreating(false);
  }

  function onDeleted(key: string) {
    void load();
    setSelectedKey(key);
    setCreating(false);
  }

  const selected = creating
    ? null
    : (borders.find((b) => b.border_key === selectedKey) ?? null);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <BorderList
        borders={borders}
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
          <BorderForm
            initial={selected}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <main
            style={{ flex: 1, padding: 40, textAlign: "center" }}
            className="muted"
          >
            Sélectionne un cadre à gauche ou crée-en un nouveau.
          </main>
        )}
      </div>
    </div>
  );
}
