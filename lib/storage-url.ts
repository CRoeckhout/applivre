import { supabaseUrl } from '@/lib/supabase';

// Réécrit l'ORIGINE d'une URL de storage Supabase vers l'origine configurée de
// l'app (`EXPO_PUBLIC_SUPABASE_URL`).
//
// Pourquoi : en dev, l'admin (navigateur sur la machine) sauve les URLs storage
// avec son propre host — souvent `127.0.0.1`/`localhost`. Sur un device, ce
// host pointe vers le device lui-même → l'image ne charge jamais. L'app, elle,
// joint Supabase via le LAN (ex. `192.168.x:54321`). On normalise donc le host.
//
// On ne touche QUE les URLs storage Supabase (path `/storage/v1/object/`) : les
// URLs externes (images.isbndb.com, books.google.com…) passent telles quelles.
// En prod, l'URL stockée et `supabaseUrl` ont la même origine → no-op.
export function resolveStorageUrl(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  const marker = '/storage/v1/object/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const base = supabaseUrl.replace(/\/$/, '');
  if (!base) return url;
  return base + url.slice(idx);
}
