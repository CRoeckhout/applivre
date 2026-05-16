import type {
  PlacedSticker,
  PublicReadingSheetTemplate,
  ReadingSheetTemplate,
  SheetAppearance,
  SheetSection,
  TemplateGenre,
} from '@/types/book';

// JSONB embarqué dans `reading_sheets_templates.content`. Miroir de
// DbSheetContent mais `appearance` est complet (signature du template).
export type DbTemplateContent = {
  appearance: SheetAppearance;
  sections: SheetSection[];
  stickers?: PlacedSticker[];
};

export type DbReadingSheetTemplate = {
  id: string;
  user_id: string;
  name: string;
  content: DbTemplateContent;
  genres: string[];
  is_public: boolean;
  is_premium: boolean;
  likes_count: number;
  forked_from_id: string | null;
  created_at: string;
  updated_at: string;
};

// Format renvoyé par list_public_templates / get_public_template (RPC).
export type DbPublicTemplate = {
  template_id: string;
  user_id: string;
  name: string;
  content: DbTemplateContent;
  genres: string[];
  is_public?: boolean;
  is_premium: boolean;
  likes_count: number;
  forked_from_id: string | null;
  created_at: string;
  updated_at: string;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  creator_username: string | null;
  is_liked: boolean;
};

export function templateFromDb(row: DbReadingSheetTemplate): ReadingSheetTemplate {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    appearance: row.content?.appearance,
    sections: row.content?.sections ?? [],
    stickers: row.content?.stickers,
    genres: row.genres ?? [],
    isPublic: row.is_public,
    isPremium: row.is_premium,
    likesCount: row.likes_count,
    forkedFromId: row.forked_from_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicTemplateFromDb(row: DbPublicTemplate): PublicReadingSheetTemplate {
  return {
    id: row.template_id,
    userId: row.user_id,
    name: row.name,
    appearance: row.content?.appearance,
    sections: row.content?.sections ?? [],
    stickers: row.content?.stickers,
    genres: row.genres ?? [],
    isPublic: row.is_public ?? true,
    isPremium: row.is_premium,
    likesCount: row.likes_count,
    forkedFromId: row.forked_from_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creator: {
      id: row.user_id,
      displayName: row.creator_display_name,
      username: row.creator_username,
      avatarUrl: row.creator_avatar_url,
    },
    isLiked: row.is_liked,
  };
}

export function templateToDbContent(
  appearance: SheetAppearance,
  sections: SheetSection[],
  stickers: PlacedSticker[] | undefined,
): DbTemplateContent {
  const content: DbTemplateContent = { appearance, sections };
  if (stickers && stickers.length > 0) content.stickers = stickers;
  return content;
}

export type DbTemplateGenre = {
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export function templateGenreFromDb(row: DbTemplateGenre): TemplateGenre {
  return {
    slug: row.slug,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}
