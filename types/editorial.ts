// Modèle d'un post du fil d'actualité éditorial (cf.
// supabase/migrations/0073_editorial_feed.sql). DISTINCT du feed social
// organique : ici un fil curé piloté par les admins (annonces, mises en
// avant…). Le `body` réutilise le schéma de blocs des release notes, rendu
// par components/release-notes/block-renderer.tsx.

import {
  parseReleaseNoteBlocks,
  type ReleaseNoteBlock,
} from '@/types/release-note';

export type EditorialPostKind =
  | 'announcement'
  | 'partner'
  | 'featured_review'
  | 'book_of_month'
  | 'featured_sheet';

export type EditorialRefKind = 'feed_entry' | 'book' | 'sheet';

export type EditorialCta = { label: string; deeplink: string };

export type EditorialPost = {
  id: string;
  kind: EditorialPostKind;
  title: string;
  // Teaser court optionnel, affiché sur la bannière/carte et le hero du détail.
  subtitle: string | null;
  body: ReleaseNoteBlock[];
  // Cible mise en avant (phases ultérieures). Détermine le routage au tap :
  //   feed_entry → /feed/[id], book → /book/[isbn], sheet → /sheet/view/[id].
  //   null (annonces) → /news/[id].
  refKind: EditorialRefKind | null;
  refId: string | null;
  // Avis mis en avant : l'id de l'book_review ciblé (cf. migration 0073). Sert
  // au template custom de la carte (note + avis) et au deep-link surligné.
  reviewId: string | null;
  coverUrl: string | null;
  cta: EditorialCta | null;
  pinned: boolean;
  priority: number;
  publishAt: string;
};

// Lien de destination au tap sur une carte, selon la nature de la cible.
export function editorialHref(post: EditorialPost): string {
  switch (post.refKind) {
    case 'feed_entry':
      return `/feed/${post.refId}`;
    case 'book':
      // Avis mis en avant → ouvre la fiche livre EN CIBLANT l'avis (scroll +
      // surbrillance, cf. app/book/[isbn].tsx). Sinon, fiche livre simple.
      return post.reviewId
        ? `/book/${post.refId}?highlightReview=${post.reviewId}`
        : `/book/${post.refId}`;
    case 'sheet':
      return `/sheet/view/${post.refId}`;
    default:
      return `/news/${post.id}`;
  }
}

function parseCta(value: unknown): EditorialCta | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r.label === 'string' && typeof r.deeplink === 'string' && r.label && r.deeplink) {
    return { label: r.label, deeplink: r.deeplink };
  }
  return null;
}

export type EditorialPostRowDb = {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  body: unknown;
  ref_kind: string | null;
  ref_id: string | null;
  review_id: string | null;
  cover_url: string | null;
  cta: unknown;
  pinned: boolean;
  priority: number;
  publish_at: string;
};

export function mapEditorialPostRow(row: EditorialPostRowDb): EditorialPost {
  return {
    id: row.id,
    kind: row.kind as EditorialPostKind,
    title: row.title,
    subtitle: row.subtitle,
    body: parseReleaseNoteBlocks(row.body),
    refKind: (row.ref_kind as EditorialRefKind | null) ?? null,
    refId: row.ref_id,
    reviewId: row.review_id ?? null,
    coverUrl: row.cover_url,
    cta: parseCta(row.cta),
    pinned: row.pinned,
    priority: row.priority,
    publishAt: row.publish_at,
  };
}
