import type {
  PlacedSticker,
  SheetAppearance,
  SheetSection,
} from '@/types/book';
import { create } from 'zustand';

// Store de transition utilisé pour passer une pré-population à l'éditeur
// de template depuis un autre écran (typiquement /sheet/[isbn] quand l'user
// clique "Sauvegarder comme template"). L'éditeur consomme le draft au mount
// puis le `clear` pour éviter qu'une ouverture ultérieure de /template/new
// ressuscite un état périmé.
//
// Pas de persistence : c'est un état strictement intra-session.

export type TemplateDraft = {
  appearance: SheetAppearance;
  sections: SheetSection[];
  stickers?: PlacedSticker[];
  // Nom suggéré (placeholder pour le drawer final). Vient typiquement du
  // titre du livre source.
  defaultName?: string;
};

type State = {
  draft: TemplateDraft | null;
  set: (draft: TemplateDraft) => void;
  consume: () => TemplateDraft | null;
  clear: () => void;
};

export const useTemplateDraft = create<State>((set, get) => ({
  draft: null,
  set: (draft) => set({ draft }),
  consume: () => {
    const current = get().draft;
    if (current) set({ draft: null });
    return current;
  },
  clear: () => set({ draft: null }),
}));
