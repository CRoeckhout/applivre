import { APP_SLUG } from '@/constants/app';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { internalDeleteBingoPill } from '@/lib/sync/internals';
import { getSyncUserId } from '@/lib/sync/session';
import { pillFromDb, type DbBingoPill } from '@/lib/sync/mappers';
import {
  syncDeleteBingo,
  syncDeleteBingoCompletion,
  syncDeleteCompletionsForUserBook,
  syncUpsertBingo,
  syncUpsertBingoCompletion,
  syncUpsertBingoPill,
} from '@/lib/sync/writers';
import { useSheetTemplates } from '@/store/sheet-templates';
import type { SheetAppearance } from '@/types/book';
import type { Bingo, BingoCompletion, BingoItem, BingoPill } from '@/types/bingo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type BingoState = {
  bingos: Bingo[];
  completions: Record<string, BingoCompletion[]>; // key = bingoId
  pills: BingoPill[]; // user lib (perso : propre user, statut variable)
  // Pills `public` d'AUTRES users — alimente le picker pour partager les
  // bonnes idées de la communauté. Refresh manuel via fetchPublicPills.
  publicPills: BingoPill[];

  createBingo: (title: string, items: BingoItem[]) => Bingo | null;
  updateBingoItems: (id: string, items: BingoItem[]) => void;
  updateBingoTitle: (id: string, title: string) => void;
  setBingoAppearance: (id: string, next: SheetAppearance | undefined) => void;
  markBingoSaved: (id: string) => void;
  archiveBingo: (id: string) => void;
  deleteBingo: (id: string) => void;

  setCompletion: (bingoId: string, cellIndex: number, userBookId: string) => void;
  removeCompletion: (bingoId: string, cellIndex: number) => void;
  removeCompletionsForUserBook: (userBookId: string) => void;

  addPill: (label: string) => BingoPill | null;
  renamePill: (id: string, label: string) => void;
  removePill: (id: string) => Promise<void>;
  // Soumet (ou re-soumet) la pill aux admins. Appelle la RPC
  // `propose_bingo_pill` côté Supabase ; à succès, met à jour le cache local.
  proposePill: (id: string, message: string | null) => Promise<BingoPill | null>;
  fetchPublicPills: () => Promise<void>;

  reset: () => void;
};

export const useBingos = create<BingoState>()(
  persist(
    (set, get) => ({
      bingos: [],
      completions: {},
      pills: [],
      publicPills: [],

      createBingo: (title, items) => {
        const userId = getSyncUserId();
        if (!userId) return null;
        const bingo: Bingo = {
          id: newId(),
          userId,
          title: title.trim() || 'Nouveau bingo',
          items,
          createdAt: new Date().toISOString(),
          appearance: useSheetTemplates.getState().global,
        };
        set((s) => ({ bingos: [bingo, ...s.bingos] }));
        void syncUpsertBingo(bingo);
        return bingo;
      },

      setBingoAppearance: (id, next) => {
        const snapshot = next ?? useSheetTemplates.getState().global;
        let updated: Bingo | undefined;
        set((s) => ({
          bingos: s.bingos.map((b) => {
            if (b.id !== id) return b;
            updated = { ...b, appearance: snapshot };
            return updated;
          }),
        }));
        if (updated) void syncUpsertBingo(updated);
      },

      updateBingoItems: (id, items) => {
        let updated: Bingo | undefined;
        set((s) => ({
          bingos: s.bingos.map((b) => {
            if (b.id !== id) return b;
            updated = { ...b, items };
            return updated;
          }),
        }));
        if (updated) void syncUpsertBingo(updated);
      },

      updateBingoTitle: (id, title) => {
        let updated: Bingo | undefined;
        set((s) => ({
          bingos: s.bingos.map((b) => {
            if (b.id !== id) return b;
            updated = { ...b, title: title.trim() || b.title };
            return updated;
          }),
        }));
        if (updated) void syncUpsertBingo(updated);
      },

      markBingoSaved: (id) => {
        let updated: Bingo | undefined;
        set((s) => ({
          bingos: s.bingos.map((b) => {
            if (b.id !== id) return b;
            if (b.savedAt) {
              updated = b;
              return b;
            }
            updated = { ...b, savedAt: new Date().toISOString() };
            return updated;
          }),
        }));
        if (updated && updated.savedAt) void syncUpsertBingo(updated);
      },

      archiveBingo: (id) => {
        let updated: Bingo | undefined;
        set((s) => ({
          bingos: s.bingos.map((b) => {
            if (b.id !== id) return b;
            updated = { ...b, archivedAt: new Date().toISOString() };
            return updated;
          }),
        }));
        if (updated) void syncUpsertBingo(updated);
      },

      deleteBingo: (id) => {
        set((s) => {
          const { [id]: _, ...rest } = s.completions;
          return {
            bingos: s.bingos.filter((b) => b.id !== id),
            completions: rest,
          };
        });
        void syncDeleteBingo(id);
      },

      setCompletion: (bingoId, cellIndex, userBookId) => {
        const existing = get().completions[bingoId]?.find(
          (c) => c.cellIndex === cellIndex,
        );
        const completion: BingoCompletion = {
          id: existing?.id ?? newId(),
          bingoId,
          cellIndex,
          userBookId,
          completedAt: existing?.completedAt ?? new Date().toISOString(),
        };
        set((s) => {
          const list = s.completions[bingoId] ?? [];
          const withoutCell = list.filter((c) => c.cellIndex !== cellIndex);
          return {
            completions: {
              ...s.completions,
              [bingoId]: [...withoutCell, completion],
            },
          };
        });
        void syncUpsertBingoCompletion(completion);
      },

      removeCompletion: (bingoId, cellIndex) => {
        set((s) => {
          const list = s.completions[bingoId] ?? [];
          return {
            completions: {
              ...s.completions,
              [bingoId]: list.filter((c) => c.cellIndex !== cellIndex),
            },
          };
        });
        void syncDeleteBingoCompletion(bingoId, cellIndex);
      },

      removeCompletionsForUserBook: (userBookId) => {
        const { completions } = get();
        const next: Record<string, BingoCompletion[]> = {};
        let changed = false;
        for (const [bingoId, list] of Object.entries(completions)) {
          const filtered = list.filter((c) => c.userBookId !== userBookId);
          if (filtered.length !== list.length) changed = true;
          next[bingoId] = filtered;
        }
        if (!changed) return;
        set({ completions: next });
        void syncDeleteCompletionsForUserBook(userBookId);
      },

      addPill: (label) => {
        const userId = getSyncUserId();
        if (!userId) return null;
        const trimmed = label.trim();
        if (!trimmed) return null;
        const existing = get().pills.find(
          (p) => p.label.toLowerCase() === trimmed.toLowerCase(),
        );
        if (existing) return existing;
        const pill: BingoPill = {
          id: newId(),
          userId,
          label: trimmed,
          createdAt: new Date().toISOString(),
          status: 'private',
          proposalMessage: null,
          decisionReason: null,
          decidedAt: null,
          decidedBy: null,
        };
        set((s) => ({ pills: [pill, ...s.pills] }));
        void syncUpsertBingoPill(pill);
        return pill;
      },

      renamePill: (id, label) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        let updated: BingoPill | undefined;
        set((s) => ({
          pills: s.pills.map((p) => {
            if (p.id !== id) return p;
            updated = { ...p, label: trimmed };
            return updated;
          }),
        }));
        if (updated) void syncUpsertBingoPill(updated);
      },

      removePill: async (id) => {
        // On NE passe PAS par syncDeleteBingoPill ici : ce writer enrobe
        // l'appel dans `runOrQueue` qui catch silencieusement les erreurs
        // pour les enqueuer en retry. Du coup une erreur métier (pill
        // devenue `public` entre temps → RPC raise 42501) serait avalée
        // côté client → la suppression locale optimiste resterait visible
        // jusqu'au prochain pull où la pill réapparaîtrait. On veut un
        // retour synchrone : appeler la RPC directement et propager.
        try {
          await internalDeleteBingoPill(id);
        } catch (err) {
          // Refetch la pill depuis la DB pour récupérer le vrai status
          // (l'auteur n'avait probablement pas son cache à jour). Aucun
          // rollback à faire côté local : on n'a rien retiré.
          const { data } = await supabase
            .from('bingo_pills')
            .select(
              'id,user_id,label,created_at,status,proposal_message,decision_reason,decided_at,decided_by',
            )
            .eq('id', id)
            .maybeSingle();
          if (data) {
            const fresh = pillFromDb(data as DbBingoPill);
            set((s) => ({
              pills: s.pills.map((p) => (p.id === id ? fresh : p)),
            }));
          }
          throw err;
        }
        // Suppression confirmée par la DB : on peut retirer du cache local.
        set((s) => ({ pills: s.pills.filter((p) => p.id !== id) }));
      },

      proposePill: async (id, message) => {
        const { data, error } = await supabase.rpc('propose_bingo_pill', {
          p_pill_id: id,
          p_message: message ?? null,
        });
        if (error) {
          console.warn('[bingo] propose_bingo_pill failed:', error.message);
          return null;
        }
        const row = (Array.isArray(data) ? data[0] : data) as
          | DbBingoPill
          | null;
        if (!row) return null;
        const updated = pillFromDb(row);
        set((s) => ({
          pills: s.pills.map((p) => (p.id === id ? updated : p)),
        }));
        return updated;
      },

      fetchPublicPills: async () => {
        const userId = getSyncUserId();
        const { data, error } = await supabase
          .from('bingo_pills')
          .select(
            'id,user_id,label,created_at,status,proposal_message,decision_reason,decided_at,decided_by',
          )
          .eq('status', 'public');
        if (error) {
          console.warn('[bingo] fetchPublicPills failed:', error.message);
          return;
        }
        const rows = (data ?? []) as DbBingoPill[];
        // Exclure les rows qui sont les pills de l'utilisateur courant
        // (déjà dans `pills`, sinon doublon dans le picker).
        const filtered = userId
          ? rows.filter((r) => r.user_id !== userId)
          : rows;
        set({ publicPills: filtered.map(pillFromDb) });
      },

      reset: () =>
        set({ bingos: [], completions: {}, pills: [], publicPills: [] }),
    }),
    {
      name: `${APP_SLUG}-bingos`,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// Dérivé : lock = grille avec au moins une completion.
export function isBingoLocked(
  bingoId: string,
  completions: Record<string, BingoCompletion[]>,
): boolean {
  return (completions[bingoId]?.length ?? 0) > 0;
}
