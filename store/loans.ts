import { APP_SLUG } from '@/constants/app';
import { newId } from '@/lib/id';
import { getSyncUserId } from '@/lib/sync/session';
import { syncDeleteLoan, syncUpsertLoan } from '@/lib/sync/writers';
import type { BookLoan } from '@/types/book';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type LoanInput = {
  userBookId: string;
  contactName: string;
  direction: 'lent' | 'borrowed';
  note?: string;
};

type LoansState = {
  loans: BookLoan[];
  createLoan: (input: LoanInput) => BookLoan;
  closeLoan: (id: string) => void;
  deleteLoan: (id: string) => void;
};

export const useLoans = create<LoansState>()(
  persist(
    (set, get) => ({
      loans: [],
      createLoan: (input) => {
        const loan: BookLoan = {
          id: newId(),
          userBookId: input.userBookId,
          contactName: input.contactName.trim(),
          direction: input.direction,
          dateOut: new Date().toISOString().slice(0, 10),
          note: input.note?.trim() || undefined,
        };
        set((s) => ({ loans: [loan, ...s.loans] }));
        if (getSyncUserId()) void syncUpsertLoan(loan);
        return loan;
      },
      closeLoan: (id) => {
        set((s) => ({
          loans: s.loans.map((l) =>
            l.id === id ? { ...l, dateBack: new Date().toISOString().slice(0, 10) } : l,
          ),
        }));
        const updated = get().loans.find((l) => l.id === id);
        if (updated && getSyncUserId()) void syncUpsertLoan(updated);
      },
      deleteLoan: (id) => {
        set((s) => ({ loans: s.loans.filter((l) => l.id !== id) }));
        if (getSyncUserId()) void syncDeleteLoan(id);
      },
    }),
    {
      name: `${APP_SLUG}-loans`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
