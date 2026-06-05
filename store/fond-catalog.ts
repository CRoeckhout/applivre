import { APP_SLUG } from '@/constants/app';
import { FONDS as STATIC_FONDS, type FondDef, type FondRepeatMode } from '@/lib/fonds/catalog';
import { ensureSkiaCached } from '@/lib/skia-image-cache';
import { supabase } from '@/lib/supabase';
import { usePremium } from '@/store/premium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Availability = 'everyone' | 'premium' | 'badge' | 'unit';

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
  availability: Availability;
  unlock_badge_key: string | null;
  retired_at: string | null;
  active_from: string | null;
  active_until: string | null;
};

type FondEntry = {
  def: FondDef;
  availability: Availability;
};

type FondCatalogState = {
  remote: FondEntry[];
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

export const useFondCatalog = create<FondCatalogState>()(
  persist(
    (set) => ({
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

    // Cf. border-catalog.ts : `badge` et `unit` filtrés si pas débloqués
    // (lifecycle serveur), `premium` toujours exposé, `everyone` toujours.
    const visible = active.filter((r) => {
      if (r.availability === 'badge' || r.availability === 'unit') {
        return unlockedKeys.has(r.fond_key);
      }
      return true;
    });
    const entries: FondEntry[] = visible
      .map<FondEntry | null>((r) => {
        const def = rowToDef(r);
        return def ? { def, availability: r.availability } : null;
      })
      .filter((e): e is FondEntry => e !== null);

    // Prefetch des PNG en cache disque pour qu'ils restent rendables hors
    // ligne (cf. border-catalog). Fire-and-forget.
    const uris = entries
      .map((e) => {
        const src = e.def.source;
        if (src && typeof src === 'object' && 'uri' in src && typeof src.uri === 'string') {
          return src.uri;
        }
        return null;
      })
      .filter((u): u is string => u !== null);
    if (uris.length > 0) {
      void ExpoImage.prefetch(uris, { cachePolicy: 'memory-disk' });
      // Fond rendu en Skia dans la fiche (skia-sheet-fond-layer) → cache disque
      // pour l'offline (Skia ne lit pas le cache d'expo-image).
      void Promise.all(uris.map((u) => ensureSkiaCached(u)));
    }

    set({ remote: entries, loaded: true });
  },
    }),
    {
      // Cf. border-catalog : persisté pour l'offline-first (SWR).
      name: `${APP_SLUG}-fond-catalog`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ remote: s.remote, loaded: s.loaded }),
    },
  ),
);

export function useAllFonds(): FondDef[] {
  const remote = useFondCatalog((s) => s.remote);
  const isPremium = usePremium((s) => s.isPremium);
  const remoteDefs = remote.map(({ def, availability }) => {
    if (availability === 'premium') {
      return { ...def, lockReason: 'premium' as const, locked: !isPremium };
    }
    return def;
  });
  return [...STATIC_FONDS, ...remoteDefs];
}
