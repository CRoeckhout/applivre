import { useEffect, useState } from "react";
import { StickerForm } from "../components/sticker-form";
import { StickerList } from "../components/sticker-list";
import { supabase } from "../lib/supabase";
import type { StickerCatalogRow } from "../lib/types";

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function StickersSection({ itemId, onItemChange }: Props) {
  const [stickers, setStickers] = useState<StickerCatalogRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "retired">("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from("sticker_catalog")
      .select("*")
      .order("sticker_key", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setStickers((data ?? []) as StickerCatalogRow[]);
  }

  function onSaved(saved: StickerCatalogRow) {
    setStickers((prev) => {
      const idx = prev.findIndex((s) => s.sticker_key === saved.sticker_key);
      if (idx === -1)
        return [...prev, saved].sort((a, b) =>
          a.sticker_key.localeCompare(b.sticker_key),
        );
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    onItemChange(saved.sticker_key);
    setCreating(false);
  }

  function onDeleted(key: string) {
    void load();
    onItemChange(key);
    setCreating(false);
  }

  const selected = creating
    ? null
    : (stickers.find((s) => s.sticker_key === itemId) ?? null);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <StickerList
        stickers={stickers}
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
          <StickerForm
            initial={selected}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <main
            style={{ flex: 1, padding: 40, textAlign: "center" }}
            className="muted"
          >
            Sélectionne un sticker à gauche ou crée-en un nouveau.
          </main>
        )}
      </div>
    </div>
  );
}
