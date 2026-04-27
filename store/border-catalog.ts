import { BORDERS as STATIC_BORDERS, type BorderDef } from '@/lib/borders/catalog';
import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

type BorderRow = {
  border_key: string;
  title: string;
  description: string | null;
  kind: 'png_9slice' | 'svg_9slice' | 'lottie_9slice';
  storage_path: string | null;
  payload: string | null;
  image_width: number;
  image_height: number;
  slice_top: number;
  slice_right: number;
  slice_bottom: number;
  slice_left: number;
  bg_inset_top: number | null;
  bg_inset_right: number | null;
  bg_inset_bottom: number | null;
  bg_inset_left: number | null;
  repeat_mode: 'stretch' | 'round';
  tokens: Record<string, string> | null;
  card_padding: number;
  is_default: boolean;
  retired_at: string | null;
  active_from: string | null;
  active_until: string | null;
};

type BorderCatalogState = {
  // Cadres effectivement disponibles pour le user courant : default-pour-tous
  // + cadres unlocked via `user_borders`. Filtre fait au fetch.
  remote: BorderDef[];
  loaded: boolean;
  fetch: (userId: string | null) => Promise<void>;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

function rowToDef(r: BorderRow): BorderDef | null {
  // Lottie pas encore supporté côté rendu — ignoré. PNG et SVG OK.
  if (r.kind !== 'png_9slice' && r.kind !== 'svg_9slice') return null;

  const hasBgInsets =
    r.bg_inset_top != null &&
    r.bg_inset_right != null &&
    r.bg_inset_bottom != null &&
    r.bg_inset_left != null;

  const baseDef = {
    id: r.border_key,
    label: r.title,
    imageSize: { width: r.image_width, height: r.image_height },
    slice: {
      top: r.slice_top,
      right: r.slice_right,
      bottom: r.slice_bottom,
      left: r.slice_left,
    },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    bgInsets: hasBgInsets
      ? {
          top: r.bg_inset_top!,
          right: r.bg_inset_right!,
          bottom: r.bg_inset_bottom!,
          left: r.bg_inset_left!,
        }
      : undefined,
    repeat: r.repeat_mode,
    tokens: r.tokens ?? undefined,
    cardPadding: r.card_padding,
  };

  if (r.kind === 'svg_9slice') {
    // SVG : payload contient le XML inline (text). storage_path supporté
    // comme fallback (fichier .svg public dans le bucket) — fetch runtime,
    // pas implémenté pour l'instant ; on attend payload.
    if (!r.payload) return null;
    return { ...baseDef, svgXml: r.payload };
  }

  // PNG : storage_path en bucket public (default), ou payload base64 fallback.
  const uri = r.storage_path
    ? `${SUPABASE_URL}/storage/v1/object/public/border-graphics/${r.storage_path}`
    : r.payload
      ? `data:image/png;base64,${r.payload}`
      : null;
  if (!uri) return null;
  return { ...baseDef, source: { uri } };
}

export const useBorderCatalog = create<BorderCatalogState>((set) => ({
  remote: [],
  loaded: false,
  fetch: async (userId: string | null) => {
    const { data, error } = await supabase
      .from('border_catalog')
      .select('*')
      .is('retired_at', null);
    if (error) {
      console.warn('[borders] fetch failed', error.message);
      return;
    }
    const now = Date.now();
    const active = (data ?? []).filter((r) => {
      const from = r.active_from ? Date.parse(r.active_from) : null;
      const until = r.active_until ? Date.parse(r.active_until) : null;
      if (from !== null && from > now) return false;
      if (until !== null && until < now) return false;
      return true;
    }) as BorderRow[];

    // Unlocks user-specific (RLS filtre au user courant). Skip si pas connecté.
    let unlockedKeys: Set<string> = new Set();
    if (userId) {
      const { data: ub, error: ubErr } = await supabase
        .from('user_borders')
        .select('border_key');
      if (ubErr) {
        console.warn('[borders] user_borders fetch failed', ubErr.message);
      } else {
        unlockedKeys = new Set((ub ?? []).map((r: { border_key: string }) => r.border_key));
      }
    }

    const visible = active.filter((r) => r.is_default || unlockedKeys.has(r.border_key));
    const defs = visible
      .map(rowToDef)
      .filter((d): d is BorderDef => d !== null);
    set({ remote: defs, loaded: true });
  },
}));

// Helper hook : retourne tous les cadres dispo (statiques + DB) dans l'ordre.
export function useAllBorders(): BorderDef[] {
  const remote = useBorderCatalog((s) => s.remote);
  return [...STATIC_BORDERS, ...remote];
}
