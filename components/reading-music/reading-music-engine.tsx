import { useReadingMusicEngine } from '@/hooks/use-reading-music-engine';

// Composant invisible qui instancie l'engine de musique au root de l'app
// (mounté dans app/_layout.tsx). Garantit qu'il n'y a qu'un seul player et
// qu'il survit aux changements de route, tout en restant couplé au store
// timer + reading-music.
export function ReadingMusicEngine() {
  useReadingMusicEngine();
  return null;
}
