import type { SheetAppearance } from '@/types/book';

// Un item placé dans une grille bingo.
// `position` 0..24 si sur la grille, `undefined` si dans le panel (pas utilisé
// côté DB puisque seuls les items positionnés sont persistés dans `grid`).
export type BingoItem = {
  id: string;
  label: string;
  position: number; // 0..24 (5x5)
};

export type Bingo = {
  id: string;
  userId: string;
  title: string;
  items: BingoItem[];
  createdAt: string;
  archivedAt?: string;
  // Timestamp du premier "Enregistrer" : bascule la grille en mode jeu.
  // Tant que non set, mode édition (rearrangement libre). Une fois set,
  // tap sur case ouvre le picker livre (sauf si ?edit=1 en param pour
  // rééditer une grille sans livres).
  savedAt?: string;
  // Snapshot de l'appearance globale (template fiche) capturé à la création.
  // Les changements ultérieurs du template global n'affectent pas cette grille.
  // setAppearance(undefined) re-snapshot le global courant.
  appearance?: SheetAppearance;
};

export type BingoCompletion = {
  id: string;
  bingoId: string;
  cellIndex: number; // 0..24
  userBookId: string;
  completedAt: string;
};

// Pills custom enregistrées par l'utilisateur (lib réutilisable entre grilles).
//
// Workflow de modération (cf. migration 0060) :
//   - private  : défaut, pill perso utilisable uniquement par son créateur.
//   - proposed : soumise aux admins via la RPC propose_bingo_pill.
//   - public   : approuvée, visible dans le picker des autres users.
//   - disabled : soft-delete admin, retirée du picker même de son créateur.
//
// Si `decisionReason` est rempli sur une pill `private`, c'est une
// proposition refusée — l'auteur peut la re-proposer.
export type BingoPillStatus = 'private' | 'proposed' | 'public' | 'disabled';

export type BingoPill = {
  id: string;
  userId: string;
  label: string;
  createdAt: string;
  status: BingoPillStatus;
  proposalMessage: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
};

export const BINGO_SIZE = 5;
export const BINGO_CELLS = BINGO_SIZE * BINGO_SIZE;
