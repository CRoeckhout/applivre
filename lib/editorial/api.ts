import { supabase } from '@/lib/supabase';
import {
  mapEditorialPostRow,
  type EditorialPost,
  type EditorialPostRowDb,
} from '@/types/editorial';

// Fil d'actualité éditorial — faible volume, un seul fetch (pas de pagination
// curseur en v1). Le RPC ne renvoie que les posts en ligne, déjà triés
// (pinned d'abord). L'app sépare ensuite pinned (carrousel) / reste (feed).
export async function fetchEditorialFeed(limit = 50): Promise<EditorialPost[]> {
  const { data, error } = await supabase.rpc('get_editorial_feed', {
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as EditorialPostRowDb[]).map(mapEditorialPostRow);
}

// Lookup d'un seul post pour l'écran détail /news/[id]. La RLS filtre la
// visibilité (publié + fenêtre publish/expire, ou admin) → null si non visible.
export async function fetchEditorialPost(
  id: string,
): Promise<EditorialPost | null> {
  const { data, error } = await supabase
    .from('editorial_posts')
    .select(
      'id, kind, title, subtitle, body, ref_kind, ref_id, review_id, cover_url, cta, pinned, priority, publish_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapEditorialPostRow(data as EditorialPostRowDb);
}
