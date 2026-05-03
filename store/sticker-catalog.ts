import { STICKERS as STATIC_STICKERS, type StickerDef } from '@/lib/stickers/catalog';
import { supabase } from '@/lib/supabase';
import { usePremium } from '@/store/premium';
import { create } from 'zustand';

type Availability = 'everyone' | 'premium' | 'badge' | 'unit';

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
  availability: Availability;
  unlock_badge_key: string | null;
  retired_at: string | null;
  active_from: string | null;
  active_until: string | null;
};

type StickerEntry = {
  def: StickerDef;
  availability: Availability;
};

type StickerCatalogState = {
  remote: StickerEntry[];
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

    // Cf. border-catalog.ts : `badge` et `unit` filtrés si pas débloqués.
    const visible = active.filter((r) => {
      if (r.availability === 'badge' || r.availability === 'unit') {
        return unlockedKeys.has(r.sticker_key);
      }
      return true;
    });
    const entries: StickerEntry[] = visible
      .map<StickerEntry | null>((r) => {
        const def = rowToDef(r);
        return def ? { def, availability: r.availability } : null;
      })
      .filter((e): e is StickerEntry => e !== null);
    set({ remote: entries, loaded: true });
  },
}));

// Helper hook : retourne tous les stickers dispo (statiques + DB) dans l'ordre.
// Utilisé par le picker. La résolution d'un id à un def passe par `find()` —
// pas un map indexé pour rester aligné avec borders/fonds.
export function useAllStickers(): StickerDef[] {
  const remote = useStickerCatalog((s) => s.remote);
  const isPremium = usePremium((s) => s.isPremium);
  const remoteDefs = remote.map(({ def, availability }) => {
    if (availability === 'premium') {
      return { ...def, lockReason: 'premium' as const, locked: !isPremium };
    }
    return def;
  });
  return [...STATIC_STICKERS, ...remoteDefs];
}
