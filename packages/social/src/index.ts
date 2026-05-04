// Public API of @grimolia/social.

export { configure, getClient } from './client';
export { registerKind, getKind, hasKind, listKinds } from './kinds';
export {
  configureProfileResolver,
  useProfile,
  useProfiles,
} from './profile';
export type { SocialProfile, ProfileResolver } from './profile';
export type { TargetRef, KindAdapter, UserId } from './types';

export * as Follows from './follows';
