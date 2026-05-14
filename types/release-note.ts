// Modèle d'une release note ("Dernières nouveautés"). Une entrée par
// version publiée (cf. supabase/migrations/0066_release_notes.sql).
// Le `body` est une liste de blocs typés rendus côté mobile par
// components/release-notes/block-renderer.tsx, et édités côté admin via
// un builder de blocs (étape 5).

export type ReleaseNoteBlock =
  | { type: 'title'; text: string }
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'image'; url: string; alt?: string };

export type ReleaseNote = {
  id: string;
  version: string;
  title: string;
  body: ReleaseNoteBlock[];
  publishedAt: string;
};

// Validation defensive du body JSONB lu depuis Supabase. Un bloc malformé
// est silencieusement ignoré plutôt que de faire crasher le rendu — la
// modale doit toujours s'afficher, même si une note a été éditée avec un
// schéma futur inconnu.
export function parseReleaseNoteBlocks(value: unknown): ReleaseNoteBlock[] {
  if (!Array.isArray(value)) return [];
  const out: ReleaseNoteBlock[] = [];
  for (const raw of value) {
    const block = parseBlock(raw);
    if (block) out.push(block);
  }
  return out;
}

function parseBlock(raw: unknown): ReleaseNoteBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'title':
      return typeof r.text === 'string' ? { type: 'title', text: r.text } : null;
    case 'text':
      return typeof r.text === 'string' ? { type: 'text', text: r.text } : null;
    case 'list':
      return Array.isArray(r.items) && r.items.every((i) => typeof i === 'string')
        ? { type: 'list', items: r.items as string[] }
        : null;
    case 'table': {
      const headers = r.headers;
      const rows = r.rows;
      if (!Array.isArray(headers) || !headers.every((h) => typeof h === 'string')) return null;
      if (!Array.isArray(rows)) return null;
      const rowsOk = rows.every(
        (row) => Array.isArray(row) && row.every((c) => typeof c === 'string'),
      );
      if (!rowsOk) return null;
      return { type: 'table', headers: headers as string[], rows: rows as string[][] };
    }
    case 'image': {
      if (typeof r.url !== 'string') return null;
      const alt = typeof r.alt === 'string' ? r.alt : undefined;
      return { type: 'image', url: r.url, alt };
    }
    default:
      return null;
  }
}

// Helper pour passer d'une row SQL (snake_case) au type front (camelCase).
export function mapReleaseNoteRow(row: {
  id: string;
  version: string;
  title: string;
  body: unknown;
  published_at: string;
}): ReleaseNote {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    body: parseReleaseNoteBlocks(row.body),
    publishedAt: row.published_at,
  };
}
