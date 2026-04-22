import { forceFlushNow } from '@/lib/sync/queue';
import NetInfo from '@react-native-community/netinfo';

let initialized = false;
let wasOnline = true;

export function initNetworkWatcher(): () => void {
  if (initialized) return () => {};
  initialized = true;

  const unsubscribe = NetInfo.addEventListener((state) => {
    const isOnline = !!state.isConnected && state.isInternetReachable !== false;

    if (isOnline && !wasOnline) {
      // Reconnexion détectée : on laisse sa chance à toutes les ops en attente,
      // en ignorant leur nextRetryAt (la cause de l'échec est peut-être résolue).
      void forceFlushNow();
    }
    wasOnline = isOnline;
  });

  return () => {
    unsubscribe();
    initialized = false;
  };
}
