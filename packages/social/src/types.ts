import type { ReactNode } from 'react';

import type { ReactionType } from './reactions/types';

export type UserId = string;

export type TargetRef = {
  kind: string;
  id: string;
};

export interface KindAdapter<T = unknown> {
  fetch: (id: string) => Promise<T | null>;
  renderCard?: (item: T) => ReactNode;
  routeTo?: (id: string) => string;
  // Set des réactions autorisées sur ce kind. Le ReactionBar lit ce champ
  // par défaut. Si absent, le composant retombe sur ['like'].
  allowedReactions?: ReactionType[];
}
