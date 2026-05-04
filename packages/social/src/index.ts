// Public API of @grimolia/social.

export { configure, getClient } from './client';
export { registerKind, getKind, hasKind, listKinds } from './kinds';
export type { TargetRef, KindAdapter, UserId } from './types';

export * as Follows from './follows';
