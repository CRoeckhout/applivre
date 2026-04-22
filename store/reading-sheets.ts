import { newId } from '@/lib/id';
import { getSyncUserId } from '@/lib/sync/session';
import { syncDeleteSheet, syncUpsertSheetDebounced } from '@/lib/sync/writers';
import type { RatingIconKind, ReadingSheet, SectionRating, SheetSection } from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SuggestedCategory = {
  title: string;
  icon?: RatingIconKind;
};

export const SUGGESTED_CATEGORIES: SuggestedCategory[] = [
  { title: 'Histoire', icon: 'star' },
  { title: 'Fin', icon: 'star' },
  { title: 'Personnages', icon: 'star' },
  { title: 'Romance', icon: 'heart' },
  { title: 'Spicy', icon: 'chili' },
  { title: 'Ambiance', icon: 'star' },
  { title: 'Ce que j\'ai aimé' },
  { title: 'Ce qui m\'a dérangé·e' },
  { title: 'Citations favorites' },
];

type SheetsState = {
  sheets: Record<string, ReadingSheet>;
  addSection: (userBookId: string, title: string, icon?: RatingIconKind) => void;
  updateSectionTitle: (userBookId: string, sectionId: string, title: string) => void;
  updateSectionBody: (userBookId: string, sectionId: string, body: string) => void;
  setSectionRating: (
    userBookId: string,
    sectionId: string,
    rating: SectionRating | null,
  ) => void;
  removeSection: (userBookId: string, sectionId: string) => void;
  removeSheet: (userBookId: string) => void;
};

function ensureSheet(
  sheets: Record<string, ReadingSheet>,
  userBookId: string,
): ReadingSheet {
  return (
    sheets[userBookId] ?? {
      userBookId,
      sections: [],
      updatedAt: new Date().toISOString(),
    }
  );
}

function touch(sheet: ReadingSheet, sections: SheetSection[]): ReadingSheet {
  return { ...sheet, sections, updatedAt: new Date().toISOString() };
}

export const useReadingSheets = create<SheetsState>()(
  persist(
    (set, get) => {
      // Déclenche la sync (upsert debounced si la fiche existe encore, sinon delete)
      const afterMutation = (userBookId: string) => {
        if (!getSyncUserId()) return;
        const sheet = get().sheets[userBookId];
        if (sheet) syncUpsertSheetDebounced(sheet);
        else void syncDeleteSheet(userBookId);
      };

      return {
        sheets: {},

        addSection: (userBookId, title, icon) => {
          set((state) => {
            const sheet = ensureSheet(state.sheets, userBookId);
            const section: SheetSection = {
              id: newId(),
              title: title.trim() || 'Sans titre',
              body: '',
              rating: icon ? { value: 0, icon } : undefined,
            };
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: touch(sheet, [...sheet.sections, section]),
              },
            };
          });
          afterMutation(userBookId);
        },

        updateSectionTitle: (userBookId, sectionId, title) => {
          set((state) => {
            const sheet = state.sheets[userBookId];
            if (!sheet) return state;
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: touch(
                  sheet,
                  sheet.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)),
                ),
              },
            };
          });
          afterMutation(userBookId);
        },

        updateSectionBody: (userBookId, sectionId, body) => {
          set((state) => {
            const sheet = state.sheets[userBookId];
            if (!sheet) return state;
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: touch(
                  sheet,
                  sheet.sections.map((s) => (s.id === sectionId ? { ...s, body } : s)),
                ),
              },
            };
          });
          afterMutation(userBookId);
        },

        setSectionRating: (userBookId, sectionId, rating) => {
          set((state) => {
            const sheet = state.sheets[userBookId];
            if (!sheet) return state;
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: touch(
                  sheet,
                  sheet.sections.map((s) =>
                    s.id === sectionId ? { ...s, rating: rating ?? undefined } : s,
                  ),
                ),
              },
            };
          });
          afterMutation(userBookId);
        },

        removeSection: (userBookId, sectionId) => {
          set((state) => {
            const sheet = state.sheets[userBookId];
            if (!sheet) return state;
            const next = sheet.sections.filter((s) => s.id !== sectionId);
            if (next.length === 0) {
              const { [userBookId]: _, ...rest } = state.sheets;
              return { sheets: rest };
            }
            return {
              sheets: { ...state.sheets, [userBookId]: touch(sheet, next) },
            };
          });
          afterMutation(userBookId);
        },

        removeSheet: (userBookId) => {
          set((state) => {
            const { [userBookId]: _, ...rest } = state.sheets;
            return { sheets: rest };
          });
          if (getSyncUserId()) void syncDeleteSheet(userBookId);
        },
      };
    },
    {
      name: 'applivre-reading-sheets',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
