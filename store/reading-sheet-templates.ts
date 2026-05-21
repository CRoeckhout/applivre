import { computeTemplatePremiumFlag } from '@/lib/templates/is-premium';
import {
  templateFromDb,
  templateGenreFromDb,
  publicTemplateFromDb,
  templateToDbContent,
  type DbPublicTemplate,
  type DbReadingSheetTemplate,
  type DbTemplateGenre,
} from '@/lib/templates/mappers';
import { supabase } from '@/lib/supabase';
import type {
  PlacedSticker,
  PublicReadingSheetTemplate,
  ReadingSheetTemplate,
  SheetAppearance,
  SheetSection,
  TemplateGenre,
} from '@/types/book';
import { create } from 'zustand';

// Store des templates de fiches.
//
// Stratégie de cache :
//   - `mine` : tous les templates créés par l'user courant (count attendu
//     faible — ~10s max). Chargé au login, mis à jour à chaque mutation
//     locale, source de vérité côté UI.
//   - `genres` : liste figée éditable côté admin. Chargée au boot, partagée
//     entre /templates (drawer recherche) et l'éditeur.
//   - Templates publics (galerie) : pas en store. Fetchés à la demande
//     avec filtres via `listPublic()` — la galerie gère elle-même son state
//     local (résultats paginés). Évite de cacher un dataset qui peut
//     grossir et tomber out-of-sync (likes_count, nouveaux templates, etc.).

export type TemplateSort = 'popular' | 'recent' | 'liked';

export type ListPublicFilters = {
  search?: string;
  genres?: string[];
  sort?: TemplateSort;
  includePremium?: boolean;
  creatorId?: string;
  limit?: number;
  offset?: number;
  // Restreint aux templates likés par le caller (auth.uid() côté serveur).
  likedOnly?: boolean;
};

type State = {
  mine: ReadingSheetTemplate[];
  mineLoaded: boolean;
  genres: TemplateGenre[];
  genresLoaded: boolean;

  fetchMine: (userId: string | null) => Promise<void>;
  fetchGenres: () => Promise<void>;

  // CRUD self
  createTemplate: (input: {
    userId: string;
    name: string;
    appearance: SheetAppearance;
    sections: SheetSection[];
    stickers?: PlacedSticker[];
    genres: string[];
    isPublic: boolean;
  }) => Promise<ReadingSheetTemplate | null>;
  updateTemplate: (
    id: string,
    patch: Partial<{
      name: string;
      appearance: SheetAppearance;
      sections: SheetSection[];
      stickers: PlacedSticker[];
      genres: string[];
      isPublic: boolean;
    }>,
  ) => Promise<ReadingSheetTemplate | null>;
  deleteTemplate: (id: string) => Promise<void>;

  // Galerie communautaire
  listPublic: (filters: ListPublicFilters) => Promise<PublicReadingSheetTemplate[]>;
  getPublic: (id: string) => Promise<PublicReadingSheetTemplate | null>;

  // Likes
  toggleLike: (templateId: string, currentlyLiked: boolean) => Promise<boolean>;

  // Clone (côté serveur via RPC). Le résultat est inséré dans `mine`.
  cloneTemplate: (templateId: string, name?: string) => Promise<ReadingSheetTemplate | null>;

  reset: () => void;
};

function sortByUpdatedDesc(a: ReadingSheetTemplate, b: ReadingSheetTemplate) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export const useReadingSheetTemplates = create<State>((set, get) => ({
  mine: [],
  mineLoaded: false,
  genres: [],
  genresLoaded: false,

  fetchMine: async (userId) => {
    if (!userId) {
      set({ mine: [], mineLoaded: true });
      return;
    }
    const { data, error } = await supabase
      .from('reading_sheets_templates')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('[templates] fetchMine failed', error.message);
      set({ mineLoaded: true });
      return;
    }
    const rows = (data ?? []) as DbReadingSheetTemplate[];
    set({ mine: rows.map(templateFromDb), mineLoaded: true });
  },

  fetchGenres: async () => {
    const { data, error } = await supabase
      .from('reading_sheets_template_genres')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.warn('[templates] fetchGenres failed', error.message);
      set({ genresLoaded: true });
      return;
    }
    const rows = (data ?? []) as DbTemplateGenre[];
    set({ genres: rows.map(templateGenreFromDb), genresLoaded: true });
  },

  createTemplate: async (input) => {
    const isPremium = computeTemplatePremiumFlag(input.appearance, input.stickers);
    const content = templateToDbContent(input.appearance, input.sections, input.stickers);
    const { data, error } = await supabase
      .from('reading_sheets_templates')
      .insert({
        user_id: input.userId,
        name: input.name.trim() || 'Sans nom',
        content,
        genres: input.genres,
        is_public: input.isPublic,
        is_premium: isPremium,
      })
      .select('*')
      .single();
    if (error || !data) {
      console.warn('[templates] createTemplate failed', error?.message);
      return null;
    }
    const t = templateFromDb(data as DbReadingSheetTemplate);
    set((s) => ({ mine: [t, ...s.mine] }));
    return t;
  },

  updateTemplate: async (id, patch) => {
    const existing = get().mine.find((t) => t.id === id);
    if (!existing) return null;
    const nextAppearance = patch.appearance ?? existing.appearance;
    const nextSections = patch.sections ?? existing.sections;
    const nextStickers = patch.stickers ?? existing.stickers;
    const nextGenres = patch.genres ?? existing.genres;
    const isPremium = computeTemplatePremiumFlag(nextAppearance, nextStickers);
    const content = templateToDbContent(nextAppearance, nextSections, nextStickers);
    const dbPatch: Record<string, unknown> = {
      content,
      genres: nextGenres,
      is_premium: isPremium,
    };
    if (patch.name !== undefined) dbPatch.name = patch.name.trim() || 'Sans nom';
    if (patch.isPublic !== undefined) dbPatch.is_public = patch.isPublic;
    const { data, error } = await supabase
      .from('reading_sheets_templates')
      .update(dbPatch)
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) {
      console.warn('[templates] updateTemplate failed', error?.message);
      return null;
    }
    const t = templateFromDb(data as DbReadingSheetTemplate);
    set((s) => ({
      mine: s.mine.map((x) => (x.id === id ? t : x)).sort(sortByUpdatedDesc),
    }));
    return t;
  },

  deleteTemplate: async (id) => {
    const { error } = await supabase
      .from('reading_sheets_templates')
      .delete()
      .eq('id', id);
    if (error) {
      console.warn('[templates] deleteTemplate failed', error.message);
      return;
    }
    set((s) => ({ mine: s.mine.filter((t) => t.id !== id) }));
  },

  listPublic: async (filters) => {
    const { data, error } = await supabase.rpc('list_public_templates', {
      p_search: filters.search ?? null,
      p_genres: filters.genres && filters.genres.length > 0 ? filters.genres : null,
      p_sort: filters.sort ?? 'popular',
      p_include_premium: filters.includePremium ?? true,
      p_creator_id: filters.creatorId ?? null,
      p_limit: filters.limit ?? 30,
      p_offset: filters.offset ?? 0,
      p_liked_only: filters.likedOnly ?? false,
    });
    if (error) {
      console.warn('[templates] listPublic failed', error.message);
      return [];
    }
    return ((data ?? []) as DbPublicTemplate[]).map(publicTemplateFromDb);
  },

  getPublic: async (id) => {
    const { data, error } = await supabase.rpc('get_public_template', {
      p_template_id: id,
    });
    if (error) {
      console.warn('[templates] getPublic failed', error.message);
      return null;
    }
    const row = (data as DbPublicTemplate[] | null)?.[0];
    return row ? publicTemplateFromDb(row) : null;
  },

  toggleLike: async (templateId, currentlyLiked) => {
    const userResp = await supabase.auth.getUser();
    const userId = userResp.data.user?.id;
    if (!userId) return currentlyLiked;
    if (currentlyLiked) {
      const { error } = await supabase
        .from('reading_sheets_template_likes')
        .delete()
        .eq('template_id', templateId)
        .eq('user_id', userId);
      if (error) {
        console.warn('[templates] unlike failed', error.message);
        return currentlyLiked;
      }
      return false;
    }
    const { error } = await supabase
      .from('reading_sheets_template_likes')
      .insert({ template_id: templateId, user_id: userId });
    if (error) {
      console.warn('[templates] like failed', error.message);
      return currentlyLiked;
    }
    return true;
  },

  cloneTemplate: async (templateId, name) => {
    const { data, error } = await supabase.rpc('clone_reading_sheets_template', {
      p_template_id: templateId,
      p_name: name ?? null,
    });
    if (error || !data) {
      console.warn('[templates] clone failed', error?.message);
      return null;
    }
    const newId = data as string;
    const { data: row, error: fetchErr } = await supabase
      .from('reading_sheets_templates')
      .select('*')
      .eq('id', newId)
      .single();
    if (fetchErr || !row) {
      console.warn('[templates] clone fetch failed', fetchErr?.message);
      return null;
    }
    const t = templateFromDb(row as DbReadingSheetTemplate);
    set((s) => ({ mine: [t, ...s.mine] }));
    return t;
  },

  reset: () => set({ mine: [], mineLoaded: false }),
}));
