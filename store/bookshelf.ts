import { getSyncUserId } from '@/lib/sync/session';
import {
  syncDeleteUserBook,
  syncUpsertBook,
  syncUpsertUserBook,
} from '@/lib/sync/writers';
import type { ReadingStatus, UserBook } from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type BookshelfState = {
  books: UserBook[];
  addBook: (book: UserBook) => void;
  removeBook: (id: string) => void;
  updateStatus: (id: string, status: ReadingStatus) => void;
  toggleFavorite: (id: string) => void;
  hasBook: (isbn: string) => boolean;
  reset: () => void;
};

export const useBookshelf = create<BookshelfState>()(
  persist(
    (set, get) => ({
      books: [],
      addBook: (book) => {
        const exists = get().books.some((b) => b.book.isbn === book.book.isbn);
        if (exists) return;
        set((state) => ({ books: [book, ...state.books] }));
        const userId = getSyncUserId();
        if (userId) {
          void syncUpsertBook(book.book);
          void syncUpsertUserBook(book, userId);
        }
      },
      removeBook: (id) => {
        set((state) => ({ books: state.books.filter((b) => b.id !== id) }));
        if (getSyncUserId()) void syncDeleteUserBook(id);
      },
      updateStatus: (id, status) => {
        let updated: UserBook | undefined;
        set((state) => ({
          books: state.books.map((b) => {
            if (b.id !== id) return b;
            const now = new Date().toISOString();
            const next = { ...b, status };
            if (status === 'reading' && !b.startedAt) next.startedAt = now;
            if (status === 'read' && !b.finishedAt) next.finishedAt = now;
            updated = next;
            return next;
          }),
        }));
        const userId = getSyncUserId();
        if (userId && updated) void syncUpsertUserBook(updated, userId);
      },
      toggleFavorite: (id) => {
        let updated: UserBook | undefined;
        set((state) => ({
          books: state.books.map((b) => {
            if (b.id !== id) return b;
            const next = { ...b, favorite: !b.favorite };
            updated = next;
            return next;
          }),
        }));
        const userId = getSyncUserId();
        if (userId && updated) void syncUpsertUserBook(updated, userId);
      },
      hasBook: (isbn) => get().books.some((b) => b.book.isbn === isbn),
      reset: () => set({ books: [] }),
    }),
    {
      name: 'applivre-bookshelf',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
