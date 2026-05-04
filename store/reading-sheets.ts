import { APP_SLUG } from '@/constants/app';
import { newId } from '@/lib/id';
import { getSyncUserId } from '@/lib/sync/session';
import { syncDeleteSheet, syncUpsertSheetDebounced } from '@/lib/sync/writers';
import { useSheetTemplates } from '@/store/sheet-templates';
import { MAX_STICKERS_PER_SHEET } from '@/lib/stickers/catalog';
import type {
  PlacedSticker,
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
  // Ajoute un sticker à la fiche. Bloqué silencieusement si la limite
  // `MAX_STICKERS_PER_SHEET` est déjà atteinte (l'UI doit aussi gater
  // l'action). Retourne l'id du nouveau placement, ou null si bloqué.
  addSticker: (
    userBookId: string,
    placement: Omit<PlacedSticker, 'id'>,
  ) => string | null;
  // Met à jour la transformation (position/scale/rotation) d'un sticker.
  // Appelé typiquement à la fin d'un geste pour persister l'état final —
  // les valeurs intermédiaires restent dans les shared values reanimated.
  updateStickerTransform: (
    userBookId: string,
    stickerPlacementId: string,
    next: Pick<PlacedSticker, 'x' | 'y' | 'scale' | 'rotation'>,
  ) => void;
  removeSticker: (userBookId: string, stickerPlacementId: string) => void;
  // Réordonne le z-order d'un sticker. `direction` : +1 = vers l'avant,
  // -1 = vers l'arrière. Aux bornes du tableau : no-op.
  reorderSticker: (
    userBookId: string,
    stickerPlacementId: string,
    direction: 1 | -1,
  ) => void;
  // Remplace l'ensemble des stickers de la fiche. Utilisé pour persister
  // un draft local (cf. screen sheet/[isbn]) après un tap utilisateur sur
  // le bouton Enregistrer — la liste fournie devient la source de vérité.
  // Tableau vide ⇒ on supprime la clé `stickers` de la fiche (pas de tableau
  // vide persisté). Limite max appliquée silencieusement (truncate).
  setStickers: (userBookId: string, stickers: PlacedSticker[]) => void;
  // Bascule la visibilité publique de la fiche. Crée la fiche (vide) si elle
  // n'existe pas — passer une fiche "publique" sans contenu n'a pas de sens
  // mais simplifie l'UX (le toggle est visible dès qu'on entre dans l'éditeur).
  setIsPublic: (userBookId: string, value: boolean) => void;
  // Injecte l'id généré côté DB après un upsert réussi. NE déclenche PAS
  // afterMutation (ce serait un re-upsert immédiat alors qu'on vient de
  // recevoir la confirmation). No-op si la fiche n'existe plus localement
  // ou si l'id est déjà connu.
  setSheetId: (userBookId: string, id: string) => void;
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
              // Si la fiche a des stickers, on garde le record (sections vides
              // mais stickers préservés). Sinon, suppression complète.
              if (sheet.stickers && sheet.stickers.length > 0) {
                return {
                  sheets: { ...state.sheets, [userBookId]: touch(sheet, next) },
                };
              }
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
              // Stickers présents ⇒ on garde la fiche avec sections vides
              // pour ne pas perdre le placement. Sinon, suppression complète.
              if (existing.stickers && existing.stickers.length > 0) {
                const updated: ReadingSheet = {
                  ...existing,
                  sections: [],
                  updatedAt: new Date().toISOString(),
                };
                return { sheets: { ...state.sheets, [userBookId]: updated } };
              }
              const { [userBookId]: _removed, ...rest } = state.sheets;
              return { sheets: rest };
            }
            const appearance = existing?.appearance ?? useSheetTemplates.getState().global;
            const updated: ReadingSheet = {
              userBookId,
              sections,
              updatedAt: new Date().toISOString(),
              appearance,
              // Préserve les stickers pose précédemment — `setSections` ne
              // doit pas écraser le placement (bug observé : valider la fiche
              // faisait disparaître les stickers).
              stickers: existing?.stickers,
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

        addSticker: (userBookId, placement) => {
          let createdId: string | null = null;
          set((state) => {
            const sheet = ensureSheet(state.sheets, userBookId);
            const current = sheet.stickers ?? [];
            if (current.length >= MAX_STICKERS_PER_SHEET) return state;
            const id = newId();
            createdId = id;
            const next: PlacedSticker = { id, ...placement };
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: {
                  ...sheet,
                  stickers: [...current, next],
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          });
          if (createdId) afterMutation(userBookId);
          return createdId;
        },

        updateStickerTransform: (userBookId, stickerPlacementId, partial) => {
          set((state) => {
            const sheet = state.sheets[userBookId];
            if (!sheet?.stickers) return state;
            const idx = sheet.stickers.findIndex((s) => s.id === stickerPlacementId);
            if (idx < 0) return state;
            const updatedSticker = { ...sheet.stickers[idx], ...partial };
            const stickers = [...sheet.stickers];
            stickers[idx] = updatedSticker;
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: {
                  ...sheet,
                  stickers,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          });
          afterMutation(userBookId);
        },

        removeSticker: (userBookId, stickerPlacementId) => {
          set((state) => {
            const sheet = state.sheets[userBookId];
            if (!sheet?.stickers) return state;
            const stickers = sheet.stickers.filter((s) => s.id !== stickerPlacementId);
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: {
                  ...sheet,
                  stickers: stickers.length > 0 ? stickers : undefined,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          });
          afterMutation(userBookId);
        },

        reorderSticker: (userBookId, stickerPlacementId, direction) => {
          set((state) => {
            const sheet = state.sheets[userBookId];
            if (!sheet?.stickers) return state;
            const idx = sheet.stickers.findIndex((s) => s.id === stickerPlacementId);
            if (idx < 0) return state;
            const targetIdx = idx + direction;
            if (targetIdx < 0 || targetIdx >= sheet.stickers.length) return state;
            const stickers = [...sheet.stickers];
            [stickers[idx], stickers[targetIdx]] = [stickers[targetIdx], stickers[idx]];
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: {
                  ...sheet,
                  stickers,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          });
          afterMutation(userBookId);
        },

        setIsPublic: (userBookId, value) => {
          set((state) => {
            const sheet = ensureSheet(state.sheets, userBookId);
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: {
                  ...sheet,
                  isPublic: value,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          });
          afterMutation(userBookId);
        },

        setSheetId: (userBookId, id) => {
          set((state) => {
            const sheet = state.sheets[userBookId];
            if (!sheet || sheet.id === id) return state;
            return {
              sheets: { ...state.sheets, [userBookId]: { ...sheet, id } },
            };
          });
        },

        setStickers: (userBookId, stickers) => {
          set((state) => {
            const truncated = stickers.slice(0, MAX_STICKERS_PER_SHEET);
            const existing = state.sheets[userBookId];
            // Pas de fiche existante : créer un placeholder uniquement si on
            // pose au moins un sticker (évite de générer une fiche vide).
            if (!existing) {
              if (truncated.length === 0) return state;
              return {
                sheets: {
                  ...state.sheets,
                  [userBookId]: {
                    userBookId,
                    sections: [],
                    updatedAt: new Date().toISOString(),
                    appearance: useSheetTemplates.getState().global,
                    stickers: truncated,
                  },
                },
              };
            }
            // Liste vide → on supprime la clé `stickers` (cf. mappers.ts qui
            // ne sérialise pas un tableau vide). Si la fiche n'a plus rien
            // (sections vides ET aucun sticker), on supprime tout le record
            // pour cohérence avec setSections/removeSection.
            if (truncated.length === 0) {
              if (existing.sections.length === 0) {
                const { [userBookId]: _, ...rest } = state.sheets;
                afterMutation(userBookId);
                return { sheets: rest };
              }
              return {
                sheets: {
                  ...state.sheets,
                  [userBookId]: {
                    ...existing,
                    stickers: undefined,
                    updatedAt: new Date().toISOString(),
                  },
                },
              };
            }
            return {
              sheets: {
                ...state.sheets,
                [userBookId]: {
                  ...existing,
                  stickers: truncated,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
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
