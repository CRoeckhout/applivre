import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

type MediaRemoteCommandsNative = {
  enable(): void;
  disable(): void;
  addListener(eventName: 'onNext' | 'onPrevious', listener: () => void): EventSubscription;
};

// `null` dans Expo Go et sur les plateformes non-iOS → enable / disable
// deviennent no-op et les listeners ne firent jamais. La feature dégrade
// proprement : skip prev/next via le widget lock-screen indisponible, mais
// les boutons in-app continuent de marcher.
const nativeModule = requireOptionalNativeModule<MediaRemoteCommandsNative>(
  'MediaRemoteCommandsModule',
);

// Active les commandes nextTrack / previousTrack sur le widget Now Playing.
// À appeler quand une lecture démarre (et qu'on veut afficher les boutons
// skip prev/next sur l'écran verrouillé).
export function enableTrackSkipCommands(): void {
  if (!nativeModule) return;
  try {
    nativeModule.enable();
  } catch {
    // ignore
  }
}

// Désactive et retire les targets natifs. À appeler quand la session ou la
// musique s'arrête, sinon les commandes restent live et iOS les affichera
// pour d'autres apps audio actives.
export function disableTrackSkipCommands(): void {
  if (!nativeModule) return;
  try {
    nativeModule.disable();
  } catch {
    // ignore
  }
}

export function onNextTrackCommand(listener: () => void): () => void {
  if (!nativeModule) return () => {};
  const sub = nativeModule.addListener('onNext', listener);
  return () => sub.remove();
}

export function onPreviousTrackCommand(listener: () => void): () => void {
  if (!nativeModule) return () => {};
  const sub = nativeModule.addListener('onPrevious', listener);
  return () => sub.remove();
}
