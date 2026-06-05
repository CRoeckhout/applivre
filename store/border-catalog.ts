import {
  BORDERS as STATIC_BORDERS,
  type BorderDef,
  type BorderSliceExtras,
} from '@/lib/borders/catalog';
import { APP_SLUG } from '@/constants/app';
import { ensureSkiaCached } from '@/lib/skia-image-cache';
import { supabase } from '@/lib/supabase';
import { usePremium } from '@/store/premium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Availability = 'everyone' | 'premium' | 'badge' | 'unit';

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
  slice_extras: BorderSliceExtras | null;
  tokens: Record<string, string> | null;
  card_padding: number;
  availability: Availability;
  unlock_badge_key: string | null;
  retired_at: string | null;
  active_from: string | null;
  active_until: string | null;
};

// `availability` est conservé à côté de chaque def pour que `useAllBorders`
// puisse calculer `locked` au runtime contre l'état premium courant. La
// `BorderDef` consommée par les composants de rendu reste pure : seuls
// `locked`/`lockReason` sont injectés (calculés dans le hook).
type BorderEntry = {
  def: BorderDef;
  availability: Availability;
};

type BorderCatalogState = {
  // Items effectivement exposables au user (visibles dans l'UI). Inclut les
  // items `premium`/`unit` (qui seront flaggés `locked` au consommateur) et
  // les items `everyone` ou `badge` débloqués via user_borders. Les `badge`
  // non débloqués sont filtrés ici (jamais exposés à l'UI).
  remote: BorderEntry[];
  loaded: boolean;
  fetch: (userId: string | null) => Promise<void>;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

function rowToDef(r: BorderRow): BorderDef | null {
  // Lottie pas encore supporté côté rendu — ignoré. PNG et SVG OK.
  if (r.kind !== 'png_9slice' && r.kind !== 'svg_9slice') return null;

  // Bg insets : fallback per-side sur slice/2 si null en DB. Ancien code
  // était tout-ou-rien (un seul null ⇒ tout retombait sur le default global),
  // ce qui surprend l'admin qui en remplit certains seulement (placeholder
  // "auto" laisse penser que les vides sont individuels).
  const bgInsets = {
    top: r.bg_inset_top ?? Math.round(r.slice_top / 2),
    right: r.bg_inset_right ?? Math.round(r.slice_right / 2),
    bottom: r.bg_inset_bottom ?? Math.round(r.slice_bottom / 2),
    left: r.bg_inset_left ?? Math.round(r.slice_left / 2),
  };

  // Valide le shape de slice_extras avant propagation : une row peut venir
  // d'une version antérieure du schema (ex. shape 5-zones) ; les shapes
  // invalides sont ignorés et la bordure retombe en 9-slice classique.
  const sliceExtras =
    r.slice_extras &&
    typeof r.slice_extras === 'object' &&
    Array.isArray((r.slice_extras as Record<string, unknown>).cutsX) &&
    Array.isArray((r.slice_extras as Record<string, unknown>).cutsY) &&
    Array.isArray((r.slice_extras as Record<string, unknown>).modes)
      ? r.slice_extras
      : undefined;

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
    bgInsets,
    repeat: r.repeat_mode,
    sliceExtras,
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

export const useBorderCatalog = create<BorderCatalogState>()(
  persist(
    (set) => ({
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

    // Visibilité :
    //   everyone : toujours exposé.
    //   premium  : toujours exposé (flaggé `locked` au consommateur si user
    //              non-abonné, paywall au tap).
    //   badge    : exposé uniquement si débloqué via user_borders (lifecycle
    //              géré côté serveur quand le badge est gagné).
    //   unit     : même lifecycle que badge — exposé uniquement si débloqué
    //              via user_borders (rule serveur d'octroi à l'unité).
    const visible = active.filter((r) => {
      if (r.availability === 'badge' || r.availability === 'unit') {
        return unlockedKeys.has(r.border_key);
      }
      return true;
    });
    const entries: BorderEntry[] = visible
      .map<BorderEntry | null>((r) => {
        const def = rowToDef(r);
        return def ? { def, availability: r.availability } : null;
      })
      .filter((e): e is BorderEntry => e !== null);

    // Prefetch des PNG : déclenche le download et le décode en RAM/disk
    // avant que NineSliceFrame ait besoin de les rendre. Pour les bordures
    // N-slice avec ~30 cells, ça évite un flash de loading sur la première
    // frame de chaque card. Fire-and-forget, pas de waiter.
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
      // Les bordures sont rendues via Skia (nine-slice), qui n'utilise pas le
      // cache d'expo-image → on les télécharge aussi sur disque pour l'offline.
      void Promise.all(uris.map((u) => ensureSkiaCached(u)));
    }

    set({ remote: entries, loaded: true });
  },
    }),
    {
      // Persisté pour l'offline-first : le catalogue (métadonnées + svgXml/URL,
      // texte uniquement) survit hors ligne. Hydrate depuis le storage →
      // fetch() écrase quand on est en ligne (SWR). Les PNG sont déjà mis en
      // cache disque par ExpoImage.prefetch ci-dessus.
      name: `${APP_SLUG}-border-catalog`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ remote: s.remote, loaded: s.loaded }),
    },
  ),
);

// Helper hook : retourne tous les cadres dispo (statiques + DB) avec les
// flags `locked`/`lockReason` calculés contre l'état premium courant.
// Les items `premium` deviennent locked si !isPremium ; les `unit` sont
// systématiquement locked en phase 2 (mécanique d'achat à venir).
export function useAllBorders(): BorderDef[] {
  const remote = useBorderCatalog((s) => s.remote);
  const isPremium = usePremium((s) => s.isPremium);
  const remoteDefs = remote.map(({ def, availability }) => {
    if (availability === 'premium') {
      // `lockReason: 'premium'` reste posé même chez l'abonné pour que l'UI
      // affiche l'étoile (signal "produit premium") ; seul `locked` dépend
      // de l'état d'abonnement courant.
      return { ...def, lockReason: 'premium' as const, locked: !isPremium };
    }
    // `badge` et `unit` débloqués sont traités comme des items everyone
    // (visibles, sélectionnables, sans étoile). Le filtre au fetch écarte
    // déjà les rows non débloquées.
    return def;
  });
  return [...STATIC_BORDERS, ...remoteDefs];
}
