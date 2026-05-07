import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

type LiveActivityNative = {
  isAvailable(): boolean;
  hasActive(): boolean;
  start(args: {
    bookTitle: string;
    bookAuthor: string;
    bookIsbn: string;
    bookCoverUrl?: string | null;
    startedAtMs: number;
  }): Promise<void>;
  update(args: {
    startedAtMs: number;
    isPaused: boolean;
    pausedAtMs?: number | null;
  }): Promise<void>;
  end(): Promise<void>;
  // Events envoyés quand l'utilisateur tappe les boutons Pause/Resume sur
  // le widget — déclenchés instantanément, sans ouvrir l'app.
  //   - Android : BroadcastReceiver → Module.dispatchEvent.
  //   - iOS 17+ : LiveActivityIntent → Darwin notification → Module observe.
  //   - iOS 16  : ces events ne firent pas (les boutons utilisent un deep
  //     link qui ouvre l'app, le hook useReadingLiveActivity réagit au
  //     query param `action` après navigation).
  addListener(
    eventName: 'onPause' | 'onResume',
    listener: () => void,
  ): EventSubscription;
};

// `null` dans Expo Go et sur les plateformes non-iOS → toutes les
// fonctions deviennent no-op pour permettre au dev de continuer en JS.
const nativeModule = requireOptionalNativeModule<LiveActivityNative>('LiveActivityModule');

export function isLiveActivityAvailable(): boolean {
  if (!nativeModule) return false;
  try {
    return nativeModule.isAvailable();
  } catch {
    return false;
  }
}

export function hasActiveReadingActivity(): boolean {
  if (!nativeModule) return false;
  try {
    return nativeModule.hasActive();
  } catch {
    return false;
  }
}

export async function startReadingActivity(args: {
  bookTitle: string;
  bookAuthor: string;
  bookIsbn: string;
  bookCoverUrl?: string | null;
  startedAtMs: number;
}): Promise<void> {
  if (!nativeModule) return;
  try {
    await nativeModule.start(args);
  } catch (err) {
    console.warn('[live-activity] start failed', err);
  }
}

export async function updateReadingActivity(args: {
  startedAtMs: number;
  isPaused: boolean;
  pausedAtMs?: number | null;
}): Promise<void> {
  if (!nativeModule) return;
  try {
    await nativeModule.update(args);
  } catch (err) {
    console.warn('[live-activity] update failed', err);
  }
}

export async function endReadingActivity(): Promise<void> {
  if (!nativeModule) return;
  try {
    await nativeModule.end();
  } catch (err) {
    console.warn('[live-activity] end failed', err);
  }
}

// Subscribe à l'event Pause envoyé par la notification Android (instantané,
// sans ouvrir l'app). No-op sur iOS et Expo Go. Retourne une fonction
// d'unsubscribe.
export function onPauseRequested(listener: () => void): () => void {
  if (!nativeModule) return () => {};
  try {
    const sub = nativeModule.addListener('onPause', listener);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export function onResumeRequested(listener: () => void): () => void {
  if (!nativeModule) return () => {};
  try {
    const sub = nativeModule.addListener('onResume', listener);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
