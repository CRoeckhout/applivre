import { FONDS as STATIC_FONDS, type FondDef, type FondRepeatMode } from '@/lib/fonds/catalog';
import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

type FondRow = {
  fond_key: string;
  title: string;
  description: string | null;
  kind: 'png_9slice' | 'svg_9slice' | 'lottie_9slice';
  storage_path: string | null;
  payload: string | null;
  image_width: number;
  image_height: number;
  repeat_mode: FondRepeatMode;
  tokens: Record<string, string> | null;
  availability: 'everyone' | 'premium' | 'badge' | 'unit';
  unlock_badge_key: string | null;
  retired_at: string | null;
  active_from: string | null;
  active_until: string | null;
};

type FondCatalogState = {
  // Fonds effectivement disponibles pour le user courant : default-pour-tous
  // + fonds unlocked via `user_fonds`. Filtre fait au fetch.
  remote: FondDef[];
  loaded: boolean;
  fetch: (userId: string | null) => Promise<void>;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

function rowToDef(r: FondRow): FondDef | null {
  if (r.kind !== 'png_9slice' && r.kind !== 'svg_9slice') return null;

  const baseDef = {
    id: r.fond_key,
    label: r.title,
    imageSize: { width: r.image_width, height: r.image_height },
    repeat: r.repeat_mode,
    tokens: r.tokens ?? undefined,
  };

  if (r.kind === 'svg_9slice') {
    if (!r.payload) return null;
    return { ...baseDef, svgXml: r.payload };
  }

  const uri = r.storage_path
    ? `${SUPABASE_URL}/storage/v1/object/public/fond-graphics/${r.storage_path}`
    : r.payload
      ? `data:image/png;base64,${r.payload}`
      : null;
  if (!uri) return null;
  return { ...baseDef, source: { uri } };
}

export const useFondCatalog = create<FondCatalogState>((set) => ({
  remote: [],
  loaded: false,
  fetch: async (userId: string | null) => {
    const { data, error } = await supabase
      .from('fond_catalog')
      .select('*')
      .is('retired_at', null);
    if (error) {
      console.warn('[fonds] fetch failed', error.message);
      return;
    }
    const now = Date.now();
    const active = (data ?? []).filter((r) => {
      const from = r.active_from ? Date.parse(r.active_from) : null;
      const until = r.active_until ? Date.parse(r.active_until) : null;
      if (from !== null && from > now) return false;
      if (until !== null && until < now) return false;
      return true;
    }) as FondRow[];

    let unlockedKeys: Set<string> = new Set();
    if (userId) {
      const { data: uf, error: ufErr } = await supabase
        .from('user_fonds')
        .select('fond_key');
      if (ufErr) {
        console.warn('[fonds] user_fonds fetch failed', ufErr.message);
      } else {
        unlockedKeys = new Set((uf ?? []).map((r: { fond_key: string }) => r.fond_key));
      }
    }

    // Phase 1 : sémantique inchangée (everyone OR unlocked). Les items
    // `premium`/`unit` sont cachés en attendant le wiring paywall (phase 2).
    const visible = active.filter(
      (r) => r.availability === 'everyone' || unlockedKeys.has(r.fond_key),
    );
    const defs = visible
      .map(rowToDef)
      .filter((d): d is FondDef => d !== null);
    set({ remote: defs, loaded: true });
  },
}));

// Helper hook : retourne tous les fonds dispo (statiques + DB) dans l'ordre.
export function useAllFonds(): FondDef[] {
  const remote = useFondCatalog((s) => s.remote);
  return [...STATIC_FONDS, ...remote];
}
