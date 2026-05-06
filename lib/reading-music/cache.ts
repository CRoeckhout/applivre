import { Directory, File, Paths } from 'expo-file-system';

// Cache offline des pistes audio par thème. Layout disque :
//   {documentDir}/reading-music/{themeKey}/manifest.json
//   {documentDir}/reading-music/{themeKey}/{trackId}.{ext}
//
// Le manifest sauvegarde la liste de pistes du thème (id, titre, durée,
// nom de fichier local) pour qu'on puisse :
//   - lister les pistes en mode offline sans appeler la RPC
//   - savoir si le cache est complet (toutes les pistes du manifest doivent
//     exister sur disque, sinon on invalide)
//
// Le manifest est ré-écrit à chaque téléchargement (online), donc il reflète
// toujours le dernier état serveur connu pour ce thème.

const ROOT = 'reading-music';

export type CachedTrack = {
  id: string;
  title: string;
  durationMs: number | null;
  localUri: string;
};

export type RemoteTrack = {
  id: string;
  title: string;
  storagePath: string;
  durationMs: number | null;
  signedUrl: string;
};

type ManifestEntry = {
  id: string;
  title: string;
  durationMs: number | null;
  filename: string;
};

type Manifest = {
  themeKey: string;
  tracks: ManifestEntry[];
  updatedAt: number;
};

function themeDir(themeKey: string): Directory {
  return new Directory(Paths.document, ROOT, themeKey);
}

function ensureDir(themeKey: string): Directory {
  const dir = themeDir(themeKey);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function manifestFile(themeKey: string): File {
  return new File(themeDir(themeKey), 'manifest.json');
}

function readManifest(themeKey: string): Manifest | null {
  const file = manifestFile(themeKey);
  if (!file.exists) return null;
  try {
    return JSON.parse(file.textSync()) as Manifest;
  } catch {
    return null;
  }
}

function writeManifest(themeKey: string, m: Manifest): void {
  ensureDir(themeKey);
  const file = manifestFile(themeKey);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(m));
}

function extFromPath(path: string): string {
  const i = path.lastIndexOf('.');
  return i > 0 ? path.slice(i + 1).toLowerCase() : 'mp3';
}

// Reconstruit la liste des pistes depuis le manifest local. Retourne null si
// le manifest n'existe pas OU si un fichier de piste manque (cache corrompu /
// partiel) — dans ce cas l'appelant doit retomber sur un téléchargement.
export function fromManifest(themeKey: string): CachedTrack[] | null {
  const m = readManifest(themeKey);
  if (!m) return null;
  const result: CachedTrack[] = [];
  for (const t of m.tracks) {
    const local = new File(themeDir(themeKey), t.filename);
    if (!local.exists) return null;
    result.push({
      id: t.id,
      title: t.title,
      durationMs: t.durationMs,
      localUri: local.uri,
    });
  }
  return result;
}

// Télécharge les pistes manquantes pour un thème, met à jour le manifest, et
// retourne la liste complète des pistes locales. Idempotent — les pistes déjà
// cachées sont skip.
export async function downloadMissing(
  themeKey: string,
  remote: RemoteTrack[],
  onProgress?: (done: number, total: number) => void,
): Promise<CachedTrack[]> {
  ensureDir(themeKey);

  const cached: CachedTrack[] = [];
  let done = 0;
  for (const r of remote) {
    const ext = extFromPath(r.storagePath);
    const filename = `${r.id}.${ext}`;
    const local = new File(themeDir(themeKey), filename);
    if (!local.exists) {
      await File.downloadFileAsync(r.signedUrl, local, { idempotent: true });
    }
    cached.push({
      id: r.id,
      title: r.title,
      durationMs: r.durationMs,
      localUri: local.uri,
    });
    done += 1;
    onProgress?.(done, remote.length);
  }

  writeManifest(themeKey, {
    themeKey,
    tracks: remote.map((r) => ({
      id: r.id,
      title: r.title,
      durationMs: r.durationMs,
      filename: `${r.id}.${extFromPath(r.storagePath)}`,
    })),
    updatedAt: Date.now(),
  });

  return cached;
}

// Supprime tout le cache d'un thème (manifest + pistes). Best-effort.
export function purgeTheme(themeKey: string): void {
  const dir = themeDir(themeKey);
  if (dir.exists) dir.delete();
}
