// Wrapper pinch-to-zoom pour la fiche. Mobile uniquement (no-op sur web).
//
// Principe : la fiche est rendue à sa largeur naturelle (SHEET_MAX_WIDTH
// = 380dp) côté layout INTERNE pour que les positions absolues des
// stickers et le wrapping textuel restent identiques sur tous les devices.
// Un transform scale + translate (GPU) adapte le rendu visuel à la
// viewport, et un wrapper outer expose au parent (ScrollView) les
// dimensions VISIBLES de la fiche scalée → pas de zone scrollable vide
// à droite/en-dessous quand scale < 1.
//
// Largeur disponible : passée explicitement via prop `availableWidth` par
// le caller qui connaît les paddings de ses parents. On ne peut PAS la
// mesurer en interne via onLayout : si on vit dans un ScrollView horizontal
// avec un contentContainer en `minWidth: '100%'` (cas du fiche editor),
// celui-ci grow pour fitter notre contenu → notre largeur mesurée devient
// notre contenu lui-même → boucle circulaire. Une prop explicite est plus
// prédictible.
//
// Calcul de scale par défaut : `min(1, refWidth / naturalWidth)` → les
// écrans étroits voient toute la fiche dès l'ouverture sans scroll. L'user
// peut pincer 2-doigts entre fitScale et MAX_SCALE.
//
// Pinch focal-point : on accumule un (translateX, translateY) en plus du
// scale pour que le point sous les 2 doigts (= focal centroid donné par
// gesture-handler) reste fixe à l'écran pendant le pinch. Formule
// standard : tx_new = fx - (fx - tx_old) * k où k = scale_new / scale_old.
//
// Clamp translate : on borne tx/ty pour que le contenu visuel reste dans
// l'outer (= zone visible). MAIS uniquement à la fin de la gesture (snap
// back via spring) — clamper pendant la gesture casserait le focal-point
// effect dès que la valeur calculée sort des bornes (cas du dezoom depuis
// une position pannée). Le user voit alors son doigt "lâcher" le point
// d'ancrage en plein milieu du pinch. Au release, on snap aux bornes
// valides → contenu centré à fitScale, contenu visible aux scales plus
// élevés.
//
// Outer dim : width ET height = naturalDim * fitScale (FIXE, pas tracking
// scale) — c'est la zone visible. Le pan horizontal ET vertical du
// contenu zoomé se fait via translate (clampé aux bornes) pendant le
// pinch, pas via le ScrollView parent. Trade-off assumé : le ScrollView
// vertical parent ne scrollera pas au-delà de la hauteur visible quand
// le contenu est zoomé ; pour voir le bas du contenu zoomé, l'user doit
// pincher avec un focal vers le bas pour ramener cette zone dans la
// visible. Symétrique X/Y → les snap-back au release respectent la
// position où l'user a relâché (à la borne près).
//
// transformOrigin: top-left → on garde l'origine au coin haut-gauche pour
// que les maths translate/scale soient triviales (visual = layout*s + t).
//
// Limite connue : les gestes sticker restent calculés en coords
// screen-space par react-native-gesture-handler, donc à scale ≠ 1 les
// drag/pinch/rotate sur stickers sont décalés. Le user a accepté cette
// régression pour itérer.

import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

// État exposé au render-prop `skiaOverlay` (cf. Props). Permet à un layer
// Skia frère de l'inner CSS-transformed de consommer les mêmes shared
// values de pinch et d'appliquer son propre transform NATIVEMENT (re-
// rasterisation crispe vs. CSS qui pixelize l'output GPU).
export type SheetPinchSkiaState = {
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  fitScale: number;
  naturalWidth: number;
  // Hauteur du contenu mesurée par l'onLayout interne, à utiliser pour
  // dimensionner le Canvas Skia. Vaut 0 tant que la mesure n'a pas eu
  // lieu — le caller doit guard sur 0 (pas de Canvas avant mesure).
  naturalHeight: number;
};

type Props = {
  naturalWidth: number;
  // Largeur réellement disponible pour la fiche dans le layout (= viewport
  // - paddings ancêtres). Cf. commentaire en tête sur pourquoi on n'auto-
  // mesure pas. Si omis, fallback sur useWindowDimensions().width avec
  // warning console.
  availableWidth?: number;
  children: ReactNode;
  // Couche visuelle Skia rendue AVANT l'inner JSX (= sous en z-order).
  // Typique : fond image, paper background. Reçoit les mêmes shared
  // values que skiaOverlay → re-rasterisation crispe à toute échelle.
  skiaUnderlay?: (state: SheetPinchSkiaState) => ReactNode;
  // Couche visuelle Skia rendue APRES l'inner JSX (= sur en z-order).
  // Typique : stickers, badges. Reçoit les shared values de pinch pour
  // appliquer son propre transform nativement dans Skia.
  skiaOverlay?: (state: SheetPinchSkiaState) => ReactNode;
  // Force désactiver (ex. web ou contexte preview read-only). Si undefined,
  // on désactive automatiquement sur web.
  enabled?: boolean;
  maxScaleCap?: number;
};

const DEFAULT_MAX = 2.5;

export function SheetPinchZoom({
  naturalWidth,
  availableWidth,
  children,
  skiaUnderlay,
  skiaOverlay,
  enabled,
  maxScaleCap = DEFAULT_MAX,
}: Props) {
  const active = enabled ?? Platform.OS !== 'web';
  const { width: vw } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState(0);

  if (availableWidth === undefined && active) {
    console.warn(
      '[SheetPinchZoom] availableWidth missing — fallback to window width. ' +
        'La fiche peut overflow si le parent a des paddings horizontaux.',
    );
  }
  const refWidth = availableWidth ?? vw;
  const fitScale = active ? Math.min(1, refWidth / naturalWidth) : 1;

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  // True dès que l'user a pinch manuellement → on arrête de re-sync
  // automatiquement scale sur fitScale (sinon une rotation device ou
  // re-layout du parent clobbrerait son zoom).
  const userPinched = useSharedValue(false);

  // Re-sync scale = fitScale tant que l'user n'a pas pinch.
  useEffect(() => {
    if (!userPinched.value) {
      scale.value = fitScale;
      translateX.value = 0;
      translateY.value = 0;
    }
  }, [fitScale, scale, translateX, translateY, userPinched]);

  const pinch = Gesture.Pinch()
    .enabled(active)
    .onStart(() => {
      'worklet';
      userPinched.value = true;
      savedScale.value = scale.value;
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const nextRaw = savedScale.value * e.scale;
      const nextScale = Math.max(fitScale, Math.min(maxScaleCap, nextRaw));
      // Compensation translate pour que le point sous les doigts (focalX,
      // focalY relatifs au gestureView = outer Animated.View) reste fixe :
      //   tx_new = fx - (fx - tx_old) * k  où k = nextScale / savedScale
      const k = nextScale / savedScale.value;
      translateX.value = e.focalX - (e.focalX - savedTx.value) * k;
      translateY.value = e.focalY - (e.focalY - savedTy.value) * k;
      scale.value = nextScale;
    })
    .onEnd(() => {
      'worklet';
      // Snap aux bornes valides via spring : à fitScale, range = [0, 0]
      // → contenu auto-centré. Aux scales plus élevés, on garde le pan
      // de l'user (X et Y symétriquement) en le bornant aux limites du
      // contenu visible.
      // overshootClamping: true → décélération naturelle sans oscillation
      // (pas de bounce visible quand le translate doit revenir de loin
      // après un dezoom avec focal-drift).
      const visualW = naturalWidth * scale.value;
      const visualH = contentHeight * scale.value;
      const outerW = naturalWidth * fitScale;
      const outerH = contentHeight * fitScale;
      const clampedTx = Math.max(outerW - visualW, Math.min(0, translateX.value));
      const clampedTy = Math.max(outerH - visualH, Math.min(0, translateY.value));
      const springCfg = {
        damping: 30,
        stiffness: 220,
        mass: 0.8,
        overshootClamping: true,
      };
      translateX.value = withSpring(clampedTx, springCfg);
      translateY.value = withSpring(clampedTy, springCfg);
    });

  const outerStyle = useAnimatedStyle(() => ({
    // FIXES tous les deux à la dim du fit — le pan du zoom est géré via
    // translate clampé (cf. onEnd), pas via croissance de l'outer. Outer
    // = zone visible, ne change pas avec le zoom.
    width: naturalWidth * fitScale,
    ...(contentHeight > 0 ? { height: contentHeight * fitScale } : null),
  }));

  // Ordre des transforms : translate APRES scale dans la liste → RN les
  // applique de droite à gauche (matrix-style), donc scale d'abord puis
  // translate. Résultat : visual = layout * scale + translate, ce qui
  // matche la formule du focal-point ci-dessus.
  const innerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    transformOrigin: 'top left' as const,
  }));

  if (!active) return <>{children}</>;

  const skiaState: SheetPinchSkiaState = {
    scale,
    translateX,
    translateY,
    fitScale,
    naturalWidth,
    naturalHeight: contentHeight,
  };

  return (
    <GestureDetector gesture={pinch}>
      <Animated.View style={outerStyle}>
        {/* Underlay Skia : rendu AVANT l'inner JSX → sous en z-order.
            absoluteFill sur l'outer, pointerEvents none. */}
        {skiaUnderlay && contentHeight > 0 ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {skiaUnderlay(skiaState)}
          </View>
        ) : null}
        <Animated.View
          style={[{ width: naturalWidth }, innerStyle]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (Math.abs(h - contentHeight) > 0.5) setContentHeight(h);
          }}>
          {children}
        </Animated.View>
        {/* Overlay Skia : rendu APRES l'inner → sur en z-order. */}
        {skiaOverlay && contentHeight > 0 ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {skiaOverlay(skiaState)}
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
