// Public API of @grimolia/social.

export { configure, getClient } from './client';
export { registerKind, getKind, hasKind, listKinds } from './kinds';
export {
  configureProfileResolver,
  useProfile,
  useProfiles,
  resolveProfiles,
} from './profile';
export type {
  SocialProfile,
  SocialProfileAppearance,
  ProfileResolver,
} from './profile';
export type { TargetRef, KindAdapter, UserId } from './types';

export * as Comments from './comments';
export * as Discover from './discover';
export * as Feed from './feed';
export * as Follows from './follows';
export * as Messaging from './messaging';
export * as Reactions from './reactions';
export * as Reviews from './reviews';
