import { useReadingMusicStore } from '@/store/reading-music';
import { useTimer } from '@/store/timer';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import {
  disableTrackSkipCommands,
  enableTrackSkipCommands,
  onNextTrackCommand,
  onPreviousTrackCommand,
} from 'grimolia-media-remote-commands';
import { useEffect } from 'react';
import { useThemeTracks } from './use-theme-tracks';

// Configure le mode audio global une seule fois (lecture en background +
// silent-mode + audio primaire pour le widget lock-screen).
//
// `interruptionMode: 'doNotMix'` est REQUIS pour que iOS affiche le widget
// Now Playing sur l'écran verrouillé. Avec `duckOthers` ou `mixWithOthers`,
// l'app est marquée comme audio secondaire et iOS masque le widget — c'est
// réservé aux apps qui prennent le contrôle exclusif de la lecture (Spotify,
// Apple Music…). Trade-off : si l'utilisateur écoute autre chose au moment
// où une session démarre, l'autre source est mise en pause.
let audioModeConfigured = false;
async function ensureAudioMode(): Promise<void> {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  try {
    await setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    audioModeConfigured = false;
  }
}

// Engine de lecture musicale. Doit être instanciée à un seul endroit dans
// l'arbre (typiquement <ReadingMusicEngine /> au root) — elle pilote le
// player audio et synchronise son état dans le store. Les composants UI
// (panel, sheet) lisent le store et appellent ses actions.
//
// Responsabilités :
//   - charge la piste courante depuis le cache local (via useThemeTracks)
//   - pousse le statut, le titre et le track count dans le store
//   - drive play/pause depuis l'intent isPlaying
//   - auto-advance à la fin d'une piste (boucle sur la queue)
//   - pousse la metadata lock-screen
//   - couple avec le timer : pause/stop session → pause/stop musique
export function useReadingMusicEngine(): void {
  const themeKey = useReadingMusicStore((s) => s.selectedThemeKey);
  const trackIndex = useReadingMusicStore((s) => s.currentTrackIndex);
  const isPlaying = useReadingMusicStore((s) => s.isPlaying);
  const setIsPlaying = useReadingMusicStore((s) => s.setIsPlaying);
  const _setStatus = useReadingMusicStore((s) => s._engineSetStatus);
  const _setTrackCount = useReadingMusicStore((s) => s._engineSetTrackCount);
  const _setTrackIndex = useReadingMusicStore((s) => s._engineSetTrackIndex);
  const _setTitle = useReadingMusicStore((s) => s._engineSetCurrentTitle);

  const next = useReadingMusicStore((s) => s.next);
  const prev = useReadingMusicStore((s) => s.prev);

  const tracksStatus = useThemeTracks(themeKey);
  const tracks = tracksStatus.kind === 'ready' ? tracksStatus.tracks : [];

  const safeIndex =
    tracks.length === 0 ? 0 : Math.min(trackIndex, tracks.length - 1);
  const currentTrack = tracks[safeIndex] ?? null;

  const player = useAudioPlayer(currentTrack?.localUri ?? null);
  const playerStatus = useAudioPlayerStatus(player);

  // Sync status dans le store pour que l'UI affiche loading / downloading / etc.
  useEffect(() => {
    switch (tracksStatus.kind) {
      case 'idle':
      case 'loading':
      case 'unavailable_offline':
      case 'ready':
        _setStatus(tracksStatus.kind);
        break;
      case 'downloading':
        _setStatus('downloading', {
          done: tracksStatus.done,
          total: tracksStatus.total,
        });
        break;
      case 'error':
        _setStatus('error', { error: tracksStatus.message });
        break;
    }
  }, [tracksStatus, _setStatus]);

  useEffect(() => {
    _setTrackCount(tracks.length);
  }, [tracks.length, _setTrackCount]);

  useEffect(() => {
    _setTitle(currentTrack?.title ?? null);
  }, [currentTrack?.id, currentTrack?.title, _setTitle]);

  useEffect(() => {
    void ensureAudioMode();
  }, []);

  // Drive le player depuis l'intent isPlaying.
  useEffect(() => {
    if (!currentTrack) return;
    if (isPlaying) player.play();
    else player.pause();
  }, [currentTrack?.localUri, isPlaying, player]);

  // Auto-advance à la fin de la piste — boucle sur la queue.
  useEffect(() => {
    if (!playerStatus.didJustFinish) return;
    if (tracks.length === 0) return;
    const nextIndex = (safeIndex + 1) % tracks.length;
    _setTrackIndex(nextIndex);
  }, [playerStatus.didJustFinish]);

  // Lock-screen metadata. Refire à chaque changement de piste ET à chaque
  // toggle play/pause pour que le widget reflète le bon playbackRate (le
  // code natif lit `player.isPlaying` à chaque call).
  useEffect(() => {
    if (!currentTrack) {
      try {
        player.clearLockScreenControls();
      } catch {
        // ignore — player peut être en cours de teardown
      }
      disableTrackSkipCommands();
      return;
    }
    try {
      player.setActiveForLockScreen(true, {
        title: currentTrack.title,
        artist: 'Grimolia',
      });
    } catch {
      // ignore
    }
    // expo-audio ne registre pas les commandes nextTrack / previousTrack,
    // on les rajoute via notre module local pour que les boutons skip du
    // widget Now Playing soient cliquables.
    enableTrackSkipCommands();
  }, [currentTrack?.id, isPlaying, player]);

  // Subscribe aux events natifs prev/next du widget Now Playing. Une seule
  // fois (les listeners persistent tant que l'engine est mounté).
  useEffect(() => {
    const unsubNext = onNextTrackCommand(() => {
      next();
    });
    const unsubPrev = onPreviousTrackCommand(() => {
      prev();
    });
    return () => {
      unsubNext();
      unsubPrev();
    };
  }, [next, prev]);

  // Couplage avec le timer : la session pilote la lecture musicale.
  const timerActive = useTimer((s) => s.active);
  const timerPaused = !!timerActive?.pausedAt;
  const hasTimer = !!timerActive;

  useEffect(() => {
    if (!hasTimer) {
      setIsPlaying(false);
      return;
    }
    setIsPlaying(!timerPaused);
  }, [hasTimer, timerPaused, setIsPlaying]);

  // Si le thème devient ready alors qu'une session tourne, lance la lecture.
  useEffect(() => {
    if (tracksStatus.kind !== 'ready') return;
    if (!hasTimer || timerPaused) return;
    if (tracks.length === 0) return;
    setIsPlaying(true);
  }, [tracksStatus.kind, hasTimer, timerPaused, tracks.length, setIsPlaying]);
}
