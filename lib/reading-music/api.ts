import { supabase } from '@/lib/supabase';
import type { RemoteTrack } from './cache';

// Erreurs métier renvoyées par la RPC get_music_theme_tracks. Mappées en
// exceptions JS distinctes pour que l'UI puisse réagir spécifiquement (ex :
// PREMIUM_REQUIRED → ouvrir le paywall).
export class PremiumRequiredError extends Error {
  constructor() {
    super('PREMIUM_REQUIRED');
    this.name = 'PremiumRequiredError';
  }
}
export class ThemeNotFoundError extends Error {
  constructor() {
    super('THEME_NOT_FOUND');
    this.name = 'ThemeNotFoundError';
  }
}

export type MusicTheme = {
  id: string;
  key: string;
  displayName: string;
  sortOrder: number;
};

// Liste les thèmes actifs. Accessible à tous les authentifiés (le sélecteur
// s'affiche aussi aux non-premium ; le paywall ne se déclenche qu'au tap).
export async function listMusicThemes(): Promise<MusicTheme[]> {
  const { data, error } = await supabase.rpc('list_music_themes');
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    key: string;
    display_name: string;
    sort_order: number;
  };
  const rows = (data ?? []) as Row[];
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    displayName: r.display_name,
    sortOrder: r.sort_order,
  }));
}

// Récupère les pistes d'un thème (RPC premium-gated) + signe les URLs des
// fichiers Storage. Renvoie le tout prêt pour le download.
export async function fetchRemoteTracks(
  themeKey: string,
): Promise<RemoteTrack[]> {
  const { data, error } = await supabase.rpc('get_music_theme_tracks', {
    p_theme_key: themeKey,
  });
  if (error) {
    if (error.code === 'P0001') throw new PremiumRequiredError();
    if (error.code === 'P0002') throw new ThemeNotFoundError();
    throw new Error(error.message);
  }
  type Row = {
    id: string;
    title: string;
    storage_path: string;
    duration_ms: number | null;
    sort_order: number;
  };
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.storage_path);
  const { data: signed, error: signErr } = await supabase.storage
    .from('music-theme-tracks')
    .createSignedUrls(paths, 60 * 60 * 24);
  if (signErr) throw new Error(`Sign URLs : ${signErr.message}`);

  return rows.map((r) => {
    const match = signed?.find((s) => s.path === r.storage_path);
    if (!match || !match.signedUrl) {
      throw new Error(`Signed URL manquant pour ${r.storage_path}`);
    }
    return {
      id: r.id,
      title: r.title,
      storagePath: r.storage_path,
      durationMs: r.duration_ms,
      signedUrl: match.signedUrl,
    };
  });
}
