import { APP_SLUG } from '@/constants/app';
import type {
  PlacedSticker,
  SheetAppearanceOverride,
  SheetSection,
} from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Bundle renvoyé par le RPC get_public_sheet (cf. app/sheet/view/[id].tsx).
// Exporté ici car aussi consommé par le cache offline.
export type PublicSheetBundle = {
  sheet_id: string;
  user_book_id: string;
  content: {
    sections?: SheetSection[];
    appearance?: SheetAppearanceOverride;
    stickers?: PlacedSticker[];
  } | null;
  is_public: boolean;
  updated_at: string;
  owner_id: string;
  book_isbn: string;
  book_title: string;
  book_authors: string[] | null;
  book_cover_url: string | null;
  book_pages: number | null;
};

// Cache offline-first des fiches consultées (get_public_sheet). Stale-while-
// revalidate : on sauve le bundle au succès du fetch (écrase), on rend le local
// en repli hors ligne / avant le fetch. Le backend reste le SSOT.
//
// Borné aux N dernières fiches vues (éviction LRU sur l'ordre de consultation)
// pour ne pas grossir indéfiniment. Les bundles sont du JSON léger SANS image
// (les assets bordure/fond/cover passent par le cache disque d'expo-image).
const MAX_CACHED = 50;

type ViewedSheetsState = {
  // Map id → bundle pour un accès O(1) au rendu.
  byId: Record<string, PublicSheetBundle>;
  // File du plus ancien au plus récent consulté (pour l'éviction LRU).
  order: string[];
  save: (bundle: PublicSheetBundle) => void;
};

export const useViewedSheets = create<ViewedSheetsState>()(
  persist(
    (set) => ({
      byId: {},
      order: [],
      save: (bundle) => {
        const id = bundle.sheet_id;
        if (!id) return;
        set((s) => {
          const order = s.order.filter((x) => x !== id);
          order.push(id);
          const byId = { ...s.byId, [id]: bundle };
          while (order.length > MAX_CACHED) {
            const evicted = order.shift();
            if (evicted) delete byId[evicted];
          }
          return { byId, order };
        });
      },
    }),
    {
      name: `${APP_SLUG}-viewed-sheets`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ byId: s.byId, order: s.order }),
    },
  ),
);
