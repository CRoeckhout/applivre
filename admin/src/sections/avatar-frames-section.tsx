import { useEffect, useState } from "react";
import { AvatarFrameForm } from "../components/avatar-frame-form";
import { AvatarFrameList } from "../components/avatar-frame-list";
import { supabase } from "../lib/supabase";
import type { AvatarFrameCatalogRow } from "../lib/types";

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function AvatarFramesSection({ itemId, onItemChange }: Props) {
  const [frames, setFrames] = useState<AvatarFrameCatalogRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "retired">("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from("avatar_frame_catalog")
      .select("*")
      .order("frame_key", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setFrames((data ?? []) as AvatarFrameCatalogRow[]);
  }

  function onSaved(saved: AvatarFrameCatalogRow) {
    setFrames((prev) => {
      const idx = prev.findIndex((f) => f.frame_key === saved.frame_key);
      if (idx === -1)
        return [...prev, saved].sort((a, b) =>
          a.frame_key.localeCompare(b.frame_key),
        );
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    onItemChange(saved.frame_key);
    setCreating(false);
  }

  function onDeleted(key: string) {
    void load();
    onItemChange(key);
    setCreating(false);
  }

  const selected = creating
    ? null
    : (frames.find((f) => f.frame_key === itemId) ?? null);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <AvatarFrameList
        frames={frames}
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
          <AvatarFrameForm
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
