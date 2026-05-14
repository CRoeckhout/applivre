import { supabase } from '@/lib/supabase';
import { useReleaseNotesStore } from '@/store/release-notes';
import { mapReleaseNoteRow, type ReleaseNote } from '@/types/release-note';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';

// Récupère les release notes plus récentes que `lastSeenVersion`. Le hook
// est passif tant que `enabled=false` (typiquement utilisé pour gater le
// fetch jusqu'à ce que la session auth soit prête dans app/_layout.tsx).
//
// `notes` est null pendant le chargement initial puis devient un tableau
// (vide si rien à afficher). `hasUnseen` est dérivé : il est vrai dès que
// le serveur renvoie au moins une note.
//
// `forceAll` : ignore `lastSeenVersion` et renvoie tout l'historique
// publié. Utilisé pour l'accès manuel depuis l'écran Profil.

export type UseReleaseNotes = {
  notes: ReleaseNote[] | null;
  currentVersion: string;
  hasUnseen: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

type Options = { forceAll?: boolean };

const CURRENT_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

export function useReleaseNotes(enabled = true, options?: Options): UseReleaseNotes {
  const lastSeenVersion = useReleaseNotesStore((s) => s.lastSeenVersion);
  const [notes, setNotes] = useState<ReleaseNote[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const forceAll = options?.forceAll ?? false;
  const sinceParam = forceAll ? null : lastSeenVersion;

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    setLoading(true);
    setError(null);

    supabase
      .rpc('get_release_notes_since', { p_last_seen: sinceParam })
      .then(({ data, error: rpcError }) => {
        if (!mounted) return;
        if (rpcError) {
          setError(rpcError.message);
          setNotes([]);
        } else {
          const rows = (data ?? []) as Parameters<typeof mapReleaseNoteRow>[0][];
          setNotes(rows.map(mapReleaseNoteRow));
        }
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [enabled, sinceParam, tick]);

  return {
    notes,
    currentVersion: CURRENT_VERSION,
    hasUnseen: (notes?.length ?? 0) > 0,
    loading,
    error,
    refetch,
  };
}
