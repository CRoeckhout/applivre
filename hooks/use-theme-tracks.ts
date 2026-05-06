import * as cache from '@/lib/reading-music/cache';
import { fetchRemoteTracks } from '@/lib/reading-music/api';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

// Statut d'un thème côté client. `unavailable_offline` = pas de cache local
// ET pas de réseau ; on affiche un message dans le panel plutôt que d'essayer
// la lecture.
export type ThemeTracksStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'ready'; tracks: cache.CachedTrack[] }
  | { kind: 'unavailable_offline' }
  | { kind: 'error'; message: string };

export function useThemeTracks(themeKey: string | null): ThemeTracksStatus {
  const [status, setStatus] = useState<ThemeTracksStatus>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    if (!themeKey) {
      setStatus({ kind: 'idle' });
      return;
    }

    void load();

    async function load() {
      setStatus({ kind: 'loading' });

      // 1. Essai cache local d'abord (offline-friendly).
      const cached = cache.fromManifest(themeKey!);
      if (cached && cached.length > 0) {
        if (!cancelled) setStatus({ kind: 'ready', tracks: cached });
        // Refresh background pour récupérer d'éventuelles nouvelles pistes.
        void backgroundRefresh();
        return;
      }

      // 2. Pas de cache → fetch serveur.
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        if (!cancelled) setStatus({ kind: 'unavailable_offline' });
        return;
      }

      try {
        const remote = await fetchRemoteTracks(themeKey!);
        if (cancelled) return;
        if (remote.length === 0) {
          setStatus({ kind: 'ready', tracks: [] });
          return;
        }
        setStatus({ kind: 'downloading', done: 0, total: remote.length });
        const tracks = await cache.downloadMissing(
          themeKey!,
          remote,
          (done, total) => {
            if (!cancelled) setStatus({ kind: 'downloading', done, total });
          },
        );
        if (!cancelled) setStatus({ kind: 'ready', tracks });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Erreur inconnue';
        setStatus({ kind: 'error', message: msg });
      }
    }

    async function backgroundRefresh() {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;
      try {
        const remote = await fetchRemoteTracks(themeKey!);
        if (cancelled || remote.length === 0) return;
        const updated = await cache.downloadMissing(themeKey!, remote);
        if (!cancelled) setStatus({ kind: 'ready', tracks: updated });
      } catch {
        // Cache local reste valide — ignore l'erreur de refresh.
      }
    }

    return () => {
      cancelled = true;
    };
  }, [themeKey]);

  return status;
}
