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
};

export type BingoCompletion = {
  id: string;
  bingoId: string;
  cellIndex: number; // 0..24
  userBookId: string;
  completedAt: string;
};

// Pills custom enregistrées par l'utilisateur (lib réutilisable entre grilles).
export type BingoPill = {
  id: string;
  userId: string;
  label: string;
  createdAt: string;
};

export const BINGO_SIZE = 5;
export const BINGO_CELLS = BINGO_SIZE * BINGO_SIZE;
