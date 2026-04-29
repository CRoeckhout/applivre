import { APP_SLUG } from '@/constants/app';
import { getSyncUserId } from '@/lib/sync/session';
import {
  syncDeleteUserBook,
  syncUpsertBook,
  syncUpsertUserBook,
} from '@/lib/sync/writers';
import { useBingos } from '@/store/bingo';
import type { ReadingStatus, UserBook } from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type BookshelfState = {
  books: UserBook[];
  addBook: (book: UserBook) => void;
  removeBook: (id: string) => void;
  updateStatus: (
    id: string,
    status: ReadingStatus,
    pauseData?: { page?: number; summary?: string },
  ) => void;
  toggleFavorite: (id: string) => void;
  setGenres: (id: string, genres: string[]) => void;
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
        // Stamp local addedAt si pas déjà fourni — pull DB ré-hydratera avec created_at.
        const stamped: UserBook = book.addedAt ? book : { ...book, addedAt: new Date().toISOString() };
        set((state) => ({ books: [stamped, ...state.books] }));
        const userId = getSyncUserId();
        if (userId) {
          void syncUpsertBook(stamped.book);
          void syncUpsertUserBook(stamped, userId);
        }
      },
      removeBook: (id) => {
        set((state) => ({ books: state.books.filter((b) => b.id !== id) }));
        if (getSyncUserId()) void syncDeleteUserBook(id);
      },
      updateStatus: (id, status, pauseData) => {
        let updated: UserBook | undefined;
        set((state) => ({
          books: state.books.map((b) => {
            if (b.id !== id) return b;
            const now = new Date().toISOString();
            const next: UserBook = { ...b, status };
            if (status === 'reading') {
              if (!b.startedAt) next.startedAt = now;
              // Nouveau cycle ouvert : on efface l'éventuel finished_at antérieur
              // pour préserver la contrainte finished_at >= started_at.
              next.finishedAt = undefined;
              // Reprise depuis pause : on efface le snapshot.
              next.pausedPage = undefined;
              next.pausedSummary = undefined;
            }
            if (status === 'paused') {
              // Snapshot saisi via la modale ; les undefined sont conservés tels
              // quels (l'utilisateur n'est pas obligé de remplir la page).
              next.pausedPage = pauseData?.page;
              next.pausedSummary = pauseData?.summary;
            }
            // Toute sortie vers un statut non-pause/non-reading purge le snapshot.
            if (status !== 'reading' && status !== 'paused') {
              next.pausedPage = undefined;
              next.pausedSummary = undefined;
            }
            if (status === 'read' && !b.finishedAt) next.finishedAt = now;
            // Garde-fou : si les deux dates existent et sont incohérentes,
            // on remet started_at sur finished_at (lecture éclair).
            if (
              next.startedAt &&
              next.finishedAt &&
              next.startedAt > next.finishedAt
            ) {
              next.startedAt = next.finishedAt;
            }
            // Règle métier : abandonné retire le J'aime.
            if (status === 'abandoned' && b.favorite) next.favorite = false;
            updated = next;
            return next;
          }),
        }));
        const userId = getSyncUserId();
        if (userId && updated) void syncUpsertUserBook(updated, userId);
        // Un livre passé en "abandonné" est retiré de tous les bingos.
        if (status === 'abandoned') {
          useBingos.getState().removeCompletionsForUserBook(id);
        }
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
      setGenres: (id, genres) => {
        let updated: UserBook | undefined;
        set((state) => ({
          books: state.books.map((b) => {
            if (b.id !== id) return b;
            const next: UserBook = {
              ...b,
              genres: genres.length > 0 ? genres : undefined,
            };
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
      name: `${APP_SLUG}-bookshelf`,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
