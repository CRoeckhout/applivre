import { useId, useState, type ComponentProps } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
// On utilise le `ScrollView` de gesture-handler car l'app monte
// `GestureHandlerRootView` au top (app/_layout.tsx). Le ScrollView natif
// RN cohabite mal avec gesture-handler dans cet arbre — le scroll devient
// aléatoire (notamment dans une Modal RN).
import { ScrollView } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type ScrollViewProps = ComponentProps<typeof ScrollView>;

type FadeProps = {
  // Hauteur du dégradé en pixels. Default 16 — assez discret pour ne pas
  // masquer le contenu mais suffisamment lisible.
  fadeHeight?: number;
  // Couleur de l'ombre. Default `#000`.
  fadeColor?: string;
  // Opacité maximale (au bord de l'ombre). 0 = invisible, 1 = opaque.
  // Default 0.12.
  fadeOpacity?: number;
};

type Props = ScrollViewProps &
  FadeProps & {
    // Style appliqué au View wrapper externe. Utile pour donner `flex: 1`
    // quand le parent est en flex column (cas typique : modale avec
    // header / scroll / footer).
    containerStyle?: StyleProp<ViewStyle>;
  };

// Drop-in replacement de ScrollView avec deux ombres dégradées en haut
// et en bas, visibles uniquement quand il reste du contenu à scroller
// dans cette direction.
//
// Le `containerStyle` cible le View wrapper externe. Les autres props
// (`style`, `contentContainerStyle`, `onScroll`, `onLayout`,
// `onContentSizeChange`, etc.) sont forwardées au ScrollView interne.
// Les handlers passés par l'appelant sont chaînés avec le tracking
// interne — pas besoin de gérer le state du scroll soi-même.
export function ScrollViewFaded({
  fadeHeight = 16,
  fadeColor = '#000',
  fadeOpacity = 0.12,
  containerStyle,
  onScroll,
  onLayout,
  onContentSizeChange,
  scrollEventThrottle = 16,
  ...rest
}: Props) {
  const [offsetY, setOffsetY] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const SCROLL_THRESHOLD = 4;
  const canScrollUp = offsetY > SCROLL_THRESHOLD;
  const canScrollDown = offsetY + viewportH < contentH - SCROLL_THRESHOLD;

  return (
    <View style={[{ position: 'relative' }, containerStyle]}>
      <ScrollView
        {...rest}
        scrollEventThrottle={scrollEventThrottle}
        onScroll={(e) => {
          setOffsetY(e.nativeEvent.contentOffset.y);
          setViewportH(e.nativeEvent.layoutMeasurement.height);
          setContentH(e.nativeEvent.contentSize.height);
          onScroll?.(e);
        }}
        onLayout={(e) => {
          setViewportH(e.nativeEvent.layout.height);
          onLayout?.(e);
        }}
        onContentSizeChange={(w, h) => {
          setContentH(h);
          onContentSizeChange?.(w, h);
        }}
      />
      <ScrollFadeEdge
        position="top"
        visible={canScrollUp}
        height={fadeHeight}
        color={fadeColor}
        opacity={fadeOpacity}
      />
      <ScrollFadeEdge
        position="bottom"
        visible={canScrollDown}
        height={fadeHeight}
        color={fadeColor}
        opacity={fadeOpacity}
      />
    </View>
  );
}

// Sous-composant exporté pour les cas où on veut combiner l'ombre avec
// un autre composant scrollable (FlatList, SectionList, custom) en
// gardant la maîtrise du tracking. `pointerEvents="none"` côté wrapper :
// les ombres ne volent jamais les gestures.
export function ScrollFadeEdge({
  position,
  visible,
  height = 16,
  color = '#000',
  opacity = 0.12,
}: {
  position: 'top' | 'bottom';
  visible: boolean;
  height?: number;
  color?: string;
  opacity?: number;
}) {
  // useId garantit un id unique par instance, pour éviter les collisions
  // entre plusieurs ScrollViewFaded montés simultanément (sinon deux
  // <defs> avec le même `id` rendent un seul des deux gradients valide).
  const reactId = useId();
  if (!visible) return null;
  const gradientId = `scroll-fade-${position}-${reactId}`;
  const y1 = position === 'top' ? '0' : '1';
  const y2 = position === 'top' ? '1' : '0';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height,
        [position]: 0,
      }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1={y1} x2="0" y2={y2}>
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={`url(#${gradientId})`}
        />
      </Svg>
    </View>
  );
}
