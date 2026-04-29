// Détection du placeholder ISBN-DB par contenu image.
//
// ISBN-DB sert une URL `https://images.isbndb.com/covers/<id>.jpg` différente
// par livre. Quand l'éditeur n'a pas fourni de couverture, l'URL existe quand
// même mais l'image servie est toujours la même placeholder. On ne peut donc
// pas filtrer par URL — il faut comparer le contenu.
//
// Stratégie : SHA-256 du body. Hash de référence calculé one-shot
// (`curl https://images.isbndb.com/covers/3388693486118.jpg | shasum -a 256`).
// Si le hash binaire change côté ISBN-DB (re-encodage, watermark…), il faudra
// re-calculer cette constante.

export const ISBNDB_PLACEHOLDER_SHA256 =
  '56c3e12f87260f78db39b9deeb0d04194e110c99702e6483963f2ab009bfea15';

// Seuil HEAD-first : les covers réelles observées font ≥ 16KB, le
// placeholder fait 3.7KB. Au-dessus de 10KB on skip le GET+hash.
const PLACEHOLDER_MAX_BYTES = 10_000;

const ISBNDB_HOST_PATTERN = 'images.isbndb.com';

// Cache résultat par URL — évite re-fetch d'une même image dans une même
// invocation edge (et lors du backfill, dans le même process Node).
const cache = new Map<string, boolean>();

export async function isIsbnDbPlaceholder(coverUrl: string | undefined | null): Promise<boolean> {
  if (!coverUrl) return false;
  if (!coverUrl.includes(ISBNDB_HOST_PATTERN)) return false;

  const cached = cache.get(coverUrl);
  if (cached !== undefined) return cached;

  let result = false;
  try {
    // HEAD-first : Content-Length sans body. Vraies covers ≥ 16KB → skip le
    // GET. On ne hash que les petites images (candidats placeholder).
    const head = await fetch(coverUrl, { method: 'HEAD' });
    if (!head.ok) {
      cache.set(coverUrl, false);
      return false;
    }
    const len = Number(head.headers.get('content-length') ?? '0');
    if (len === 0 || len > PLACEHOLDER_MAX_BYTES) {
      cache.set(coverUrl, false);
      return false;
    }

    // Image suspecte (< 10KB) → fetch + hash pour confirmer.
    const res = await fetch(coverUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const hash = await sha256Hex(buf);
      result = hash === ISBNDB_PLACEHOLDER_SHA256;
    }
  } catch {
    // Réseau / DNS / timeout : on ne marque pas comme placeholder. La cover
    // sera ré-évaluée au prochain passage.
    result = false;
  }

  cache.set(coverUrl, result);
  return result;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
