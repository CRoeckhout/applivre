import { APP_SLUG } from '@/constants/app';
import { newId } from '@/lib/id';
import { getSyncUserId } from '@/lib/sync/session';
import { syncDeleteSheet, syncUpsertSheetDebounced } from '@/lib/sync/writers';
import { useSheetTemplates } from '@/store/sheet-templates';
import type {
  RatingIconKind,
  ReadingSheet,
  SectionRating,
  SheetAppearance,
  SheetSection,
} from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// SuggestedCategory est remplacée par SheetDefaultCategory côté types.
// On garde l'alias pour éviter de casser les anciens imports.
export type SuggestedCategory = {
  title: string;
  icon?: RatingIconKind;
};

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
  // Remplace entièrement les sections (draft commit). Tableau vide = supprime la fiche.
  setSections: (userBookId: string, sections: SheetSection[]) => void;
  removeSheet: (userBookId: string) => void;
  // Remplace l'appearance complète. `undefined` = re-snapshot du template global courant.
  setAppearance: (
    userBookId: string,
    next: SheetAppearance | undefined,
  ) => void;
};

// Lors de la création d'une fiche, on snapshot le template global courant
// dans `appearance`. Ainsi modifier le global après coup n'affecte plus cette fiche.
function ensureSheet(
  sheets: Record<string, ReadingSheet>,
  userBookId: string,
): ReadingSheet {
  const existing = sheets[userBookId];
  if (existing) return existing;
  return {
    userBookId,
    sections: [],
    updatedAt: new Date().toISOString(),
    appearance: useSheetTemplates.getState().global,
  };
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

        setSections: (userBookId, sections) => {
          set((state) => {
            const existing = state.sheets[userBookId];
            if (sections.length === 0) {
              if (!existing) return state;
              const { [userBookId]: _removed, ...rest } = state.sheets;
              return { sheets: rest };
            }
            const appearance = existing?.appearance ?? useSheetTemplates.getState().global;
            const updated: ReadingSheet = {
              userBookId,
              sections,
              updatedAt: new Date().toISOString(),
              appearance,
            };
            return { sheets: { ...state.sheets, [userBookId]: updated } };
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

        setAppearance: (userBookId, next) => {
          set((state) => {
            // Reset = re-snapshot du global courant (à la demande de l'user).
            const snapshot = next ?? useSheetTemplates.getState().global;
            const existing = state.sheets[userBookId];
            const updated: ReadingSheet = existing
              ? { ...existing, appearance: snapshot, updatedAt: new Date().toISOString() }
              : {
                  userBookId,
                  sections: [],
                  updatedAt: new Date().toISOString(),
                  appearance: snapshot,
                };
            return { sheets: { ...state.sheets, [userBookId]: updated } };
          });
          afterMutation(userBookId);
        },
      };
    },
    {
      name: `${APP_SLUG}-reading-sheets`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
