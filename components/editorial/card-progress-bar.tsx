import { Animated, View } from 'react-native';

// Barre de progression du carrousel « À la une », rendue DANS la card active :
// clippée par son overflow-hidden + rounded-2xl → arrondi des coins bas
// parfait. Couleurs adaptées au fond (image sombre vs papier). Extraite
// d'editorial-card pour être réutilisable par les templates custom
// (featured-sheet-card) sans import circulaire.
export function CardProgressBar({
  progress,
  overlay,
}: {
  progress: Animated.Value;
  overlay: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 }}
      className={overlay ? 'bg-white/25' : 'bg-ink/15'}
    >
      <Animated.View
        className={overlay ? 'bg-white' : 'bg-accent'}
        style={{
          height: '100%',
          width: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
        }}
      />
    </View>
  );
}
