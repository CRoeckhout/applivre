import {
  AVATAR_FRAMES as STATIC_AVATAR_FRAMES,
  type AvatarFrameDef,
} from '@/lib/avatar-frames/catalog';
import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

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
  availability: 'everyone' | 'premium' | 'badge' | 'unit';
  unlock_badge_key: string | null;
  retired_at: string | null;
  active_from: string | null;
  active_until: string | null;
};

type AvatarFrameCatalogState = {
  // Cadres effectivement disponibles pour le user courant : default-pour-tous
  // + cadres unlocked via `user_avatar_frames`. Filtre fait au fetch.
  remote: AvatarFrameDef[];
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

export const useAvatarFrameCatalog = create<AvatarFrameCatalogState>((set) => ({
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

    // Phase 1 : sémantique inchangée (everyone OR unlocked). `premium`/`unit`
    // cachés tant que le wiring paywall n'est pas en place (phase 2).
    const visible = active.filter(
      (r) => r.availability === 'everyone' || unlockedKeys.has(r.frame_key),
    );
    const defs = visible
      .map(rowToDef)
      .filter((d): d is AvatarFrameDef => d !== null);
    set({ remote: defs, loaded: true });
  },
}));

// Helper hook : retourne tous les cadres dispo (sentinel 'none' + DB).
export function useAllAvatarFrames(): AvatarFrameDef[] {
  const remote = useAvatarFrameCatalog((s) => s.remote);
  return [...STATIC_AVATAR_FRAMES, ...remote];
}
