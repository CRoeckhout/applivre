import type { ReactNode } from 'react';

export type UserId = string;

export type TargetRef = {
  kind: string;
  id: string;
};

export interface KindAdapter<T = unknown> {
  fetch: (id: string) => Promise<T | null>;
  renderCard?: (item: T) => ReactNode;
  routeTo?: (id: string) => string;
}
