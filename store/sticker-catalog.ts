import { STICKERS as STATIC_STICKERS, type StickerDef } from '@/lib/stickers/catalog';
import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

type StickerRow = {
  sticker_key: string;
  title: string;
  description: string | null;
  kind: 'png' | 'svg';
  storage_path: string | null;
  payload: string | null;
  image_width: number;
  image_height: number;
  tokens: Record<string, string> | null;
  is_default: boolean;
  retired_at: string | null;
  active_from: string | null;
  active_until: string | null;
};

type StickerCatalogState = {
  // Stickers effectivement disponibles pour le user courant : default-pour-tous
  // + stickers unlocked via `user_stickers`. Filtre fait au fetch.
  remote: StickerDef[];
  loaded: boolean;
  fetch: (userId: string | null) => Promise<void>;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

function rowToDef(r: StickerRow): StickerDef | null {
  const baseDef = {
    id: r.sticker_key,
    label: r.title,
    imageSize: { width: r.image_width, height: r.image_height },
    tokens: r.tokens ?? undefined,
  };

  if (r.kind === 'svg') {
    if (!r.payload) return null;
    return { ...baseDef, svgXml: r.payload };
  }

  // PNG : on construit l'URL publique depuis storage_path. `payload` est
  // toléré comme fallback inline base64 (utile pour des tests admin sans
  // upload), mais le path en storage reste le chemin nominal.
  const uri = r.storage_path
    ? `${SUPABASE_URL}/storage/v1/object/public/sticker-graphics/${r.storage_path}`
    : r.payload
      ? `data:image/png;base64,${r.payload}`
      : null;
  if (!uri) return null;
  return { ...baseDef, source: { uri } };
}

export const useStickerCatalog = create<StickerCatalogState>((set) => ({
  remote: [],
  loaded: false,
  fetch: async (userId: string | null) => {
    const { data, error } = await supabase
      .from('sticker_catalog')
      .select('*')
      .is('retired_at', null);
    if (error) {
      console.warn('[stickers] fetch failed', error.message);
      return;
    }
    const now = Date.now();
    const active = (data ?? []).filter((r) => {
      const from = r.active_from ? Date.parse(r.active_from) : null;
      const until = r.active_until ? Date.parse(r.active_until) : null;
      if (from !== null && from > now) return false;
      if (until !== null && until < now) return false;
      return true;
    }) as StickerRow[];

    let unlockedKeys: Set<string> = new Set();
    if (userId) {
      const { data: us, error: usErr } = await supabase
        .from('user_stickers')
        .select('sticker_key');
      if (usErr) {
        console.warn('[stickers] user_stickers fetch failed', usErr.message);
      } else {
        unlockedKeys = new Set(
          (us ?? []).map((r: { sticker_key: string }) => r.sticker_key),
        );
      }
    }

    const visible = active.filter((r) => r.is_default || unlockedKeys.has(r.sticker_key));
    const defs = visible
      .map(rowToDef)
      .filter((d): d is StickerDef => d !== null);
    set({ remote: defs, loaded: true });
  },
}));

// Helper hook : retourne tous les stickers dispo (statiques + DB) dans l'ordre.
// Utilisé par le picker. La résolution d'un id à un def passe par `find()` —
// pas un map indexé pour rester aligné avec borders/fonds.
export function useAllStickers(): StickerDef[] {
  const remote = useStickerCatalog((s) => s.remote);
  return [...STATIC_STICKERS, ...remote];
}
