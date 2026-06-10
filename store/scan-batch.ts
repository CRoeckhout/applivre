import type { Book } from '@/types/book';
import { create } from 'zustand';

// Passerelle éphémère scanner → page de classement. Non persistée : une pile
// de scan ne doit pas survivre à un redémarrage de l'app.
type ScanBatchState = {
  items: Book[];
  add: (book: Book) => void;
  remove: (isbn: string) => void;
  clear: () => void;
};

export const useScanBatch = create<ScanBatchState>((set, get) => ({
  items: [],
  add: (book) => {
    if (get().items.some((b) => b.isbn === book.isbn)) return; // dédup par ISBN
    set((state) => ({ items: [...state.items, book] }));
  },
  remove: (isbn) => set((state) => ({ items: state.items.filter((b) => b.isbn !== isbn) })),
  clear: () => set({ items: [] }),
}));
