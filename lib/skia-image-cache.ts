import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Le cache fichier ne vise que le natif (Skia + expo-file-system). Sur web,
// Skia charge directement l'URL distante (cache navigateur), on no-op.
const FS_AVAILABLE = Platform.OS !== 'web';

// Cache disque des images chargées par Skia (`useImage`). Skia a son PROPRE
// loader réseau et n'utilise PAS le cache disque d'expo-image — donc les
// bordures / fonds / stickers PNG (rendus dans un canvas Skia) ne survivent pas
// hors ligne via `ExpoImage.prefetch`. On télécharge ces PNG sur le disque et on
// passe à Skia un `file://` local, qui se charge sans réseau.
//
// Layout : {documentDir}/skia-image-cache/{hash(url)}.{ext}

const ROOT = 'skia-image-cache';

function hash(s: string): string {
  // djb2 — suffisant pour nommer une poignée d'assets sans collision.
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function extOf(url: string): string {
  const clean = url.split('?')[0];
  const i = clean.lastIndexOf('.');
  const e = i > 0 ? clean.slice(i + 1).toLowerCase() : '';
  return e && e.length <= 5 ? e : 'png';
}

// Seules les URLs http(s) sont cachées sur disque. data:/file:/asset passent
// tels quels (Skia les charge directement, déjà offline-capable).
function isRemote(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function dir(): Directory {
  return new Directory(Paths.document, ROOT);
}

function fileFor(url: string): File {
  return new File(dir(), `${hash(url)}.${extOf(url)}`);
}

// file:// local si déjà présent, sinon null (synchrone — pour le 1er render).
export function cachedSkiaUri(url: string): string | null {
  if (!FS_AVAILABLE) return null;
  if (!isRemote(url)) return url;
  try {
    const f = fileFor(url);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

// Télécharge si absent. Retourne le file:// local (ou l'URL d'origine si non
// cachable / échec). Idempotent, best-effort.
export async function ensureSkiaCached(url: string): Promise<string> {
  if (!FS_AVAILABLE || !isRemote(url)) return url;
  try {
    const d = dir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const f = fileFor(url);
    if (!f.exists) await File.downloadFileAsync(url, f, { idempotent: true });
    return f.exists ? f.uri : url;
  } catch {
    return url;
  }
}

export function clearSkiaImageCache(): void {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // best-effort
  }
}

// Hook : résout une URL distante vers son file:// local pour Skia.
// - cache présent → file:// (offline OK).
// - absent → déclenche le download en fond et rend l'URL distante en attendant
//   (online : Skia la charge ; la fois d'après sera offline-capable).
export function useSkiaCachedUri(url: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(() =>
    url ? (cachedSkiaUri(url) ?? url) : null,
  );
  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    if (!isRemote(url)) {
      setResolved(url);
      return;
    }
    const local = cachedSkiaUri(url);
    if (local) {
      setResolved(local);
      return;
    }
    let cancelled = false;
    setResolved(url); // fallback online en attendant le download
    void ensureSkiaCached(url).then((u) => {
      if (!cancelled) setResolved(u);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return resolved;
}
