import {
  AVATAR_FRAMES as STATIC_AVATAR_FRAMES,
  type AvatarFrameDef,
} from '@/lib/avatar-frames/catalog';
import { APP_SLUG } from '@/constants/app';
import { supabase } from '@/lib/supabase';
import { usePremium } from '@/store/premium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Availability = 'everyone' | 'premium' | 'badge' | 'unit';

type AvatarFrameRow = {
  frame_key: string;
  title: string;
  description: string | null;
  kind: 'png';
  storage_path: string | null;
  payload: string | null;
  image_width: number;
  image_height: number;
  image_scale: number;
  image_padding: number;
  availability: Availability;
  unlock_badge_key: string | null;
  retired_at: string | null;
  active_from: string | null;
  active_until: string | null;
};

type AvatarFrameEntry = {
  def: AvatarFrameDef;
  availability: Availability;
};

type AvatarFrameCatalogState = {
  remote: AvatarFrameEntry[];
  loaded: boolean;
  fetch: (userId: string | null) => Promise<void>;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

function rowToDef(r: AvatarFrameRow): AvatarFrameDef | null {
  // PNG : on construit l'URL publique depuis storage_path. `payload` toléré
  // comme fallback inline base64 (parité avec stickers/fonds, mais pas le
  // chemin nominal côté admin).
  const uri = r.storage_path
    ? `${SUPABASE_URL}/storage/v1/object/public/avatar-frame-graphics/${r.storage_path}`
    : r.payload
      ? `data:image/png;base64,${r.payload}`
      : null;
  if (!uri) return null;
  return {
    id: r.frame_key,
    label: r.title,
    imageSize: { width: r.image_width, height: r.image_height },
    imageScale: r.image_scale,
    imagePadding: r.image_padding,
    source: { uri },
  };
}

export const useAvatarFrameCatalog = create<AvatarFrameCatalogState>()(
  persist(
    (set) => ({
  remote: [],
  loaded: false,
  fetch: async (userId: string | null) => {
    const { data, error } = await supabase
      .from('avatar_frame_catalog')
      .select('*')
      .is('retired_at', null);
    if (error) {
      console.warn('[avatar-frames] fetch failed', error.message);
      return;
    }
    const now = Date.now();
    const active = (data ?? []).filter((r) => {
      const from = r.active_from ? Date.parse(r.active_from) : null;
      const until = r.active_until ? Date.parse(r.active_until) : null;
      if (from !== null && from > now) return false;
      if (until !== null && until < now) return false;
      return true;
    }) as AvatarFrameRow[];

    let unlockedKeys: Set<string> = new Set();
    if (userId) {
      const { data: uaf, error: uafErr } = await supabase
        .from('user_avatar_frames')
        .select('frame_key');
      if (uafErr) {
        console.warn('[avatar-frames] user_avatar_frames fetch failed', uafErr.message);
      } else {
        unlockedKeys = new Set(
          (uaf ?? []).map((r: { frame_key: string }) => r.frame_key),
        );
      }
    }

    // Cf. border-catalog.ts : `badge` et `unit` filtrés si pas débloqués.
    const visible = active.filter((r) => {
      if (r.availability === 'badge' || r.availability === 'unit') {
        return unlockedKeys.has(r.frame_key);
      }
      return true;
    });
    const entries: AvatarFrameEntry[] = visible
      .map<AvatarFrameEntry | null>((r) => {
        const def = rowToDef(r);
        return def ? { def, availability: r.availability } : null;
      })
      .filter((e): e is AvatarFrameEntry => e !== null);

    // Prefetch des PNG en cache disque pour que le cadre de la photo de profil
    // reste rendable hors ligne (cf. border-catalog).
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
    }

    set({ remote: entries, loaded: true });
  },
    }),
    {
      // Cf. border-catalog : persisté pour l'offline-first (SWR).
      name: `${APP_SLUG}-avatar-frame-catalog`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ remote: s.remote, loaded: s.loaded }),
    },
  ),
);

// Helper hook : retourne tous les cadres dispo (sentinel 'none' + DB), avec
// `locked`/`lockReason` calculés depuis l'état premium courant.
export function useAllAvatarFrames(): AvatarFrameDef[] {
  const remote = useAvatarFrameCatalog((s) => s.remote);
  const isPremium = usePremium((s) => s.isPremium);
  const remoteDefs = remote.map(({ def, availability }) => {
    if (availability === 'premium') {
      return { ...def, lockReason: 'premium' as const, locked: !isPremium };
    }
    return def;
  });
  return [...STATIC_AVATAR_FRAMES, ...remoteDefs];
}
