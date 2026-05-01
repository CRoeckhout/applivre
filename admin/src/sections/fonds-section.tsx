import { useEffect, useState } from "react";
import { FondForm } from "../components/fond-form";
import { FondList } from "../components/fond-list";
import { supabase } from "../lib/supabase";
import type { FondCatalogRow } from "../lib/types";

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function FondsSection({ itemId, onItemChange }: Props) {
  const [fonds, setFonds] = useState<FondCatalogRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "retired">("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from("fond_catalog")
      .select("*")
      .order("fond_key", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setFonds((data ?? []) as FondCatalogRow[]);
  }

  function onSaved(saved: FondCatalogRow) {
    setFonds((prev) => {
      const idx = prev.findIndex((f) => f.fond_key === saved.fond_key);
      if (idx === -1)
        return [...prev, saved].sort((a, b) =>
          a.fond_key.localeCompare(b.fond_key),
        );
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    onItemChange(saved.fond_key);
    setCreating(false);
  }

  function onDeleted(key: string) {
    void load();
    onItemChange(key);
    setCreating(false);
  }

  const selected = creating
    ? null
    : (fonds.find((f) => f.fond_key === itemId) ?? null);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <FondList
        fonds={fonds}
        selectedKey={creating ? null : itemId}
        filter={filter}
        onFilterChange={setFilter}
        onSelect={(k) => {
          onItemChange(k);
          setCreating(false);
        }}
        onNew={() => {
          setCreating(true);
          onItemChange(null);
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Load error: {loadError}
          </div>
        )}
        {selected || creating ? (
          <FondForm
            initial={selected}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <main
            style={{ flex: 1, padding: 40, textAlign: "center" }}
            className="muted"
          >
            Sélectionne un fond à gauche ou crée-en un nouveau.
          </main>
        )}
      </div>
    </div>
  );
}
