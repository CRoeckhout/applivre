import { forceFlushNow } from '@/lib/sync/queue';
import { useNetwork } from '@/store/network';
import NetInfo from '@react-native-community/netinfo';

let initialized = false;
let wasOnline = true;

export function initNetworkWatcher(): () => void {
  if (initialized) return () => {};
  initialized = true;

  // État initial : on interroge NetInfo une fois pour ne pas rester bloqué sur
  // l'optimiste `true` du store si l'app démarre déjà hors ligne.
  void NetInfo.fetch().then((state) => {
    const isOnline = !!state.isConnected && state.isInternetReachable !== false;
    wasOnline = isOnline;
    useNetwork.getState().setOnline(isOnline);
  });

  const unsubscribe = NetInfo.addEventListener((state) => {
    const isOnline = !!state.isConnected && state.isInternetReachable !== false;

    useNetwork.getState().setOnline(isOnline);

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
