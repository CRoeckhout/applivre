import { supabase, SUPABASE_URL } from './supabase';

// Buckets publics Supabase Storage utilisés par les catalogs perso. Mêmes
// chemins que côté app mobile (cf. store/{border,fond,avatar-frame,sticker}-catalog.ts).
const BUCKETS = {
  border: 'border-graphics',
  fond: 'fond-graphics',
  avatarFrame: 'avatar-frame-graphics',
  sticker: 'sticker-graphics',
} as const;

export type CatalogBucketKey = keyof typeof BUCKETS;

// Construit l'URL publique d'un asset stocké dans un bucket public Supabase.
// Renvoie null si pas de path (caller doit gérer le fallback). On préfère le
// `getPublicUrl` du SDK pour rester aligné si l'URL pattern bouge ; concat
// manuelle utilisée comme fallback (et pour debug visible).
export function publicAssetUrl(
  bucket: CatalogBucketKey,
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  const bucketName = BUCKETS[bucket];
  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  return data?.publicUrl ?? `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${path}`;
}
