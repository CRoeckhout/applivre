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
import { Platform } from 'react-native';
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
  const _setTitle = useReadingMusicStore((s) => s._engineSetCurrentTitle);

  const next = useReadingMusicStore((s) => s.next);
  const prev = useReadingMusicStore((s) => s.prev);

  const tracksStatus = useThemeTracks(themeKey);
  const tracks = tracksStatus.kind === 'ready' ? tracksStatus.tracks : [];

  const safeIndex =
    tracks.length === 0 ? 0 : Math.min(trackIndex, tracks.length - 1);
  const currentTrack = tracks[safeIndex] ?? null;

  // Player unique et stable : on initialise sans source et on swap les pistes
  // via player.replace() ci-dessous. Recréer le player à chaque changement
  // d'URI (i.e. useAudioPlayer(uri)) cassait la lecture en arrière-plan
  // quand l'écran était verrouillé : le JS étant throttlé, le nouveau player
  // recevait play() avant d'avoir pris le contrôle de la session audio iOS.
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  // Couplage avec le timer : la session pilote la lecture musicale. Dérivé tôt
  // car l'effet lock-screen ci-dessous en dépend (relâche le widget Now Playing
  // dès que la session se termine, même si le thème reste sélectionné en store).
  const timerActive = useTimer((s) => s.active);
  const timerPaused = !!timerActive?.pausedAt;
  const hasTimer = !!timerActive;

  useEffect(() => {
    if (!currentTrack) return;
    player.replace(currentTrack.localUri);
    // Tentative de lecture immédiate. `replace()` est asynchrone (chargement de
    // la source) et remet le player en pause ; l'effet de réconciliation plus
    // bas rattrape si cette tentative arrive avant que la source soit chargée.
    if (useReadingMusicStore.getState().isPlaying) player.play();
  }, [currentTrack?.localUri, player]);

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

  // Réconcilie l'état réel du player avec l'intent `isPlaying`. Robuste à la
  // course replace→play : dès que la nouvelle source est chargée (isLoaded,
  // playing encore false) on relance, ce qui corrige les transitions où la
  // piste suivante restait figée en pause. On ne relance pas une piste qui
  // vient de finir (didJustFinish) — l'auto-advance prend le relais.
  useEffect(() => {
    if (!currentTrack || !playerStatus.isLoaded) return;
    if (isPlaying && !playerStatus.playing && !playerStatus.didJustFinish) {
      player.play();
    } else if (!isPlaying && playerStatus.playing) {
      player.pause();
    }
  }, [
    isPlaying,
    playerStatus.isLoaded,
    playerStatus.playing,
    playerStatus.didJustFinish,
    currentTrack,
    player,
  ]);

  // Auto-advance à la fin de la piste — boucle sur la queue. On passe par
  // l'action `next()` du store (lit l'état frais via get(), pas de closure
  // périmée). Queue d'une seule piste : `next()` ne changerait pas l'index donc
  // l'effet de chargement ne se redéclencherait pas → on reboucle à la main.
  useEffect(() => {
    if (!playerStatus.didJustFinish) return;
    if (tracks.length === 0) return;
    if (tracks.length === 1) {
      player.seekTo(0);
      if (useReadingMusicStore.getState().isPlaying) player.play();
      return;
    }
    next();
  }, [playerStatus.didJustFinish, tracks.length, next, player]);

  // Lock-screen metadata. iOS only — sur Android le widget système Now
  // Playing serait un doublon du panel audio affiché in-app dans la
  // session de lecture. On laisse expo-audio jouer en background sans
  // démarrer son AudioControlsService (le ReadingActivityService du
  // module live-activity garde déjà le process en vie côté Android).
  //
  // Refire à chaque changement de piste ET à chaque toggle play/pause
  // pour que le widget reflète le bon playbackRate (le code natif iOS
  // lit `player.isPlaying` à chaque call).
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    // Session terminée (`!hasTimer`) ou pas de piste → on relâche le widget Now
    // Playing. Le garde `hasTimer` est essentiel : le thème restant persisté en
    // store garde `currentTrack` non-null après l'arrêt de la session, et sans
    // ça iOS afficherait indéfiniment la piste figée de la session précédente.
    if (!currentTrack || !hasTimer) {
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
  }, [currentTrack?.id, isPlaying, hasTimer, player]);

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
