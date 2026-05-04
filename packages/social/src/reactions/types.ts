// Vocabulaire des réactions. Volontairement fermé (3 types) : si on en
// rajoute, il faut bumper le check côté SQL (cf. migration 0002). Garder
// petit évite les choix paralysants pour l'utilisateur.

export type ReactionType = 'like' | 'love' | 'laugh';

export const REACTION_TYPES: ReadonlyArray<ReactionType> = [
  'like',
  'love',
  'laugh',
];

export type ReactionDef = {
  type: ReactionType;
  emoji: string;
  label: string;
};

export const REACTION_DEFS: Record<ReactionType, ReactionDef> = {
  like: { type: 'like', emoji: '👍', label: "J'aime" },
  love: { type: 'love', emoji: '❤️', label: "J'adore" },
  laugh: { type: 'laugh', emoji: '😂', label: "Drôle" },
};

// État agrégé d'une cible côté UI : combien de chaque type, et lesquels
// l'utilisateur courant a déjà posés (pour le toggle / highlight).
export type ReactionSummary = {
  counts: Record<ReactionType, number>;
  myReactions: Record<ReactionType, boolean>;
};

export const EMPTY_SUMMARY: ReactionSummary = {
  counts: { like: 0, love: 0, laugh: 0 },
  myReactions: { like: false, love: false, laugh: false },
};
