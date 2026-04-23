import { newId } from '@/lib/id';
import { DEFAULT_APPEARANCE } from '@/lib/sheet-appearance';
import type { SheetPreset } from '@/lib/sheet-presets';
import type { SheetAppearance } from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type TemplateState = {
  // Template global — base pour toutes les fiches. Un override par-fiche
  // peut surcharger n'importe quel champ via ReadingSheet.appearance.
  global: SheetAppearance;
  // Placeholder : l'user pourra publier son template global plus tard.
  globalIsPublic: boolean;
  // Presets créés par l'user. Listés en premier dans l'éditeur.
  userPresets: SheetPreset[];
  setGlobal: (next: SheetAppearance) => void;
  updateGlobal: (partial: Partial<SheetAppearance>) => void;
  setGlobalIsPublic: (value: boolean) => void;
  resetGlobal: () => void;
  addUserPreset: (label: string, appearance: SheetAppearance) => SheetPreset;
  deleteUserPreset: (id: string) => void;
  renameUserPreset: (id: string, label: string) => void;
};

export const useSheetTemplates = create<TemplateState>()(
  persist(
    (set) => ({
      global: DEFAULT_APPEARANCE,
      globalIsPublic: false,
      userPresets: [],
      setGlobal: (next) => set({ global: next }),
      updateGlobal: (partial) =>
        set((s) => ({ global: { ...s.global, ...partial } })),
      setGlobalIsPublic: (value) => set({ globalIsPublic: value }),
      resetGlobal: () => set({ global: DEFAULT_APPEARANCE, globalIsPublic: false }),
      addUserPreset: (label, appearance) => {
        const preset: SheetPreset = { id: newId(), label, appearance };
        set((s) => ({ userPresets: [preset, ...s.userPresets] }));
        return preset;
      },
      deleteUserPreset: (id) =>
        set((s) => ({ userPresets: s.userPresets.filter((p) => p.id !== id) })),
      renameUserPreset: (id, label) =>
        set((s) => ({
          userPresets: s.userPresets.map((p) =>
            p.id === id ? { ...p, label } : p,
          ),
        })),
    }),
    {
      name: 'applivre-sheet-templates',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
