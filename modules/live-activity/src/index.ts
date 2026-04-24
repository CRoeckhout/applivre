import { requireOptionalNativeModule } from 'expo';

type LiveActivityNative = {
  isAvailable(): boolean;
  hasActive(): boolean;
  start(args: {
    bookTitle: string;
    bookAuthor: string;
    bookIsbn: string;
    startedAtMs: number;
  }): Promise<void>;
  update(args: {
    startedAtMs: number;
    isPaused: boolean;
    pausedAtMs?: number | null;
  }): Promise<void>;
  end(): Promise<void>;
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
