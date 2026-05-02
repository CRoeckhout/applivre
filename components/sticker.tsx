import { useThemeColors } from '@/hooks/use-theme-colors';
import { applyTokens } from '@/lib/decorations/tokens';
import {
  STICKER_NATURAL_WIDTH,
  STICKER_SCALE_MAX,
  STICKER_SCALE_MIN,
  type StickerDef,
} from '@/lib/stickers/catalog';
import { useStickerCatalog } from '@/store/sticker-catalog';
import { usePreferences } from '@/store/preferences';
import type { PlacedSticker } from '@/types/book';
import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

// Coordonnées exposées à la barre flottante quand ce sticker est sélectionné.
// Le parent (StickerLayer) crée ces shared values une seule fois et les passe
// à tous les Sticker ; chaque Sticker écrit dedans uniquement quand il est
// sélectionné — le toolbar lit pour suivre la position en temps réel.
export type StickerSelectionRefs = {
  centerX: SharedValue<number>;
  centerY: SharedValue<number>;
  // Dimi-extents du sticker (déjà multipliées par scale), pour que le toolbar
  // se positionne juste sous la box visible. Rotation ignorée (approx.).
  halfHeight: SharedValue<number>;
};

type Props = {
  placement: PlacedSticker;
  layerWidth: number;
  layerHeight: number;
  isSelected: boolean;
  onSelect: () => void;
  onCommit: (next: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  }) => void;
  // Refs partagées vers le toolbar — le sticker sélectionné y miroirise sa
  // transformation via `useAnimatedReaction` pour un suivi 60fps sans passer
  // par le JS thread.
  selectionRefs: StickerSelectionRefs;
  // Notifications de touche sur le sticker. Déclenché à chaque `onBegin` et
  // `onFinalize` des 4 gestures (tap, pan, pinch, rotation) — le parent
  // counte les overlapping pour désactiver le scroll de la fiche tant qu'au
  // moins un finger reste posé sur un sticker. Sans ça, le ScrollView
  // englobant capte le touch (notamment sur 2 doigts pour pinch/rotate) et
  // bloque les gestures.
  onInteractStart: () => void;
  onInteractEnd: () => void;
};

// Géométrie du halo de sélection. Le ring est dessiné en absolute avec des
// insets négatifs autour du sticker — il s'étend vers l'extérieur sans
// affecter la taille de la box rendue (sinon un `borderWidth` sur le wrapper
// inset la zone de contenu et compresse l'image/SVG).
const RING_INSET = 4;
const RING_WIDTH = 2;
const RING_RADIUS = 8;

export function Sticker({
  placement,
  layerWidth,
  layerHeight,
  isSelected,
  onSelect,
  onCommit,
  selectionRefs,
  onInteractStart,
  onInteractEnd,
}: Props) {
  const remote = useStickerCatalog((s) => s.remote);
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const theme = useThemeColors();

  const def: StickerDef | undefined = useMemo(
    () => remote.find((s) => s.id === placement.stickerId),
    [remote, placement.stickerId],
  );

  // Tokens SVG résolus selon prefs/theme + overrides per-placement (mêmes
  // règles que cadres et fonds — réutilise `applyTokens`).
  const themedSvgXml = useMemo(() => {
    if (!def?.svgXml) return undefined;
    return applyTokens(
      def.svgXml,
      def.tokens,
      { colorPrimary, colorSecondary, colorBg },
      theme,
      placement.colorOverrides,
    );
  }, [
    def?.svgXml,
    def?.tokens,
    colorPrimary,
    colorSecondary,
    colorBg,
    theme,
    placement.colorOverrides,
  ]);

  // Taille naturelle absolue (cf. catalog) — indépendante de la largeur du
  // layer pour qu'un sticker garde la même taille visuelle peu importe le
  // device. Seule la position (x/y) reste relative via les fractions stockées.
  // L'AR est préservé via imageSize ; le multiplicateur `placement.scale` est
  // appliqué via transform (pas via width/height) pour rester smooth pendant
  // le pinch.
  const naturalWidth = STICKER_NATURAL_WIDTH;
  const aspectRatio = def
    ? def.imageSize.height / def.imageSize.width
    : 1;
  const naturalHeight = naturalWidth * aspectRatio;

  // Shared values en pixels (relatif au layer). On stocke en relatif (0..1)
  // mais on travaille en px pendant les gestures pour des deltas naturels.
  const x = useSharedValue(placement.x * layerWidth);
  const y = useSharedValue(placement.y * layerHeight);
  const scale = useSharedValue(placement.scale);
  const rotation = useSharedValue(placement.rotation);

  // Bases capturées au début de chaque geste, pour additionner les deltas
  // sans dériver de l'état courant à chaque update.
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedRotation = useSharedValue(0);

  // Sync si le placement change côté store (ex: reorder, autre client) ou
  // si la taille du layer change (rotation device).
  useEffect(() => {
    x.value = placement.x * layerWidth;
    y.value = placement.y * layerHeight;
    scale.value = placement.scale;
    rotation.value = placement.rotation;
  }, [
    placement.x,
    placement.y,
    placement.scale,
    placement.rotation,
    layerWidth,
    layerHeight,
    x,
    y,
    scale,
    rotation,
  ]);

  const commit = () => {
    onCommit({
      x: x.value / Math.max(1, layerWidth),
      y: y.value / Math.max(1, layerHeight),
      scale: scale.value,
      rotation: rotation.value,
    });
  };

  // Pan : drag à 1 doigt strict. Le centre du sticker est clampé sur les
  // bornes du layer ([0, layerWidth] × [0, layerHeight]) — l'image peut
  // visuellement déborder mais le sticker reste ancré à la fiche.
  // `maxPointers(1)` empêche le pan de réclamer le centroid à 2 doigts, ce
  // qui libère pinch + rotation pour s'exécuter en parallèle sans conflit.
  // `activeOffsetX/Y([-5, 5])` : laisse passer un Tap pur (sans drag de >5px
  // dans aucune direction) sans démarrer le pan.
  //
  // `.onBegin` / `.onFinalize` notifient le parent qu'un finger touche le
  // sticker — il désactive le scroll englobant tant que c'est le cas (cf.
  // Props.onInteractStart/End).
  const pan = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX([-5, 5])
    .activeOffsetY([-5, 5])
    .onBegin(() => {
      runOnJS(onInteractStart)();
    })
    .onStart(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    })
    .onUpdate((e) => {
      const nx = savedX.value + e.translationX;
      const ny = savedY.value + e.translationY;
      x.value = Math.max(0, Math.min(layerWidth, nx));
      y.value = Math.max(0, Math.min(layerHeight, ny));
    })
    .onEnd(() => {
      runOnJS(commit)();
    })
    .onFinalize(() => {
      runOnJS(onInteractEnd)();
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      runOnJS(onInteractStart)();
    })
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      const ns = savedScale.value * e.scale;
      scale.value = Math.max(STICKER_SCALE_MIN, Math.min(STICKER_SCALE_MAX, ns));
    })
    .onEnd(() => {
      runOnJS(commit)();
    })
    .onFinalize(() => {
      runOnJS(onInteractEnd)();
    });

  const rotate = Gesture.Rotation()
    .onBegin(() => {
      runOnJS(onInteractStart)();
    })
    .onStart(() => {
      savedRotation.value = rotation.value;
    })
    .onUpdate((e) => {
      rotation.value = savedRotation.value + e.rotation;
    })
    .onEnd(() => {
      runOnJS(commit)();
    })
    .onFinalize(() => {
      runOnJS(onInteractEnd)();
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onBegin(() => {
      runOnJS(onInteractStart)();
    })
    .onEnd((_e, success) => {
      if (success) runOnJS(onSelect)();
    })
    .onFinalize(() => {
      runOnJS(onInteractEnd)();
    });

  // `Simultaneous` pour TOUS les gestures (tap + pan + pinch + rotate) —
  // permet à pinch/rotate à 2 doigts de tourner librement même quand le tap
  // est encore en évaluation. Les gestures restent mutuellement compatibles
  // grâce à leurs activations distinctes : tap (court+immobile), pan (1
  // doigt + >5px), pinch/rotate (≥2 doigts). Plus d'`Exclusive` : il bloquait
  // pinch/rotate tant que tap n'avait pas explicitement échoué.
  const gesture = Gesture.Simultaneous(tap, pan, pinch, rotate);

  // Pousse en continu la transformation courante vers les shared values
  // partagées avec le toolbar — uniquement quand ce sticker est sélectionné.
  // Tourne sur le UI thread, donc le toolbar suit le drag/pinch/rotate à
  // 60fps sans round-trip JS. Re-évalue quand `isSelected` change pour
  // basculer entre miroir actif et no-op.
  useAnimatedReaction(
    () => ({
      x: x.value,
      y: y.value,
      s: scale.value,
    }),
    (cur) => {
      if (!isSelected) return;
      selectionRefs.centerX.value = cur.x;
      selectionRefs.centerY.value = cur.y;
      selectionRefs.halfHeight.value = (naturalHeight * cur.s) / 2;
    },
    [isSelected, naturalHeight],
  );

  // Sync immédiat à la sélection : la `useAnimatedReaction` ne pousse les
  // valeurs qu'au prochain frame du fait du mécanisme d'observation. Au tout
  // premier render après select, il faut amorcer le toolbar pour qu'il
  // apparaisse au bon endroit dès la première frame.
  useEffect(() => {
    if (!isSelected) return;
    selectionRefs.centerX.value = x.value;
    selectionRefs.centerY.value = y.value;
    selectionRefs.halfHeight.value = (naturalHeight * scale.value) / 2;
  }, [
    isSelected,
    naturalHeight,
    x,
    y,
    scale,
    selectionRefs.centerX,
    selectionRefs.centerY,
    selectionRefs.halfHeight,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      // Translate vers (x, y) au CENTRE de la View (la View elle-même fait
      // naturalWidth × naturalHeight donc on retire la moitié pour obtenir
      // un centre = (x, y)).
      { translateX: x.value - naturalWidth / 2 },
      { translateY: y.value - naturalHeight / 2 },
      // Scale et rotate pivotent autour du centre de la View (default RN).
      { scale: scale.value },
      { rotate: `${rotation.value}rad` },
    ],
  }));

  // Si le sticker est introuvable dans le catalog (retiré, plus unlocked,
  // catalog encore en chargement), on skip silencieusement le rendu mais on
  // garde le placement persisté pour le récupérer si la dispo revient.
  if (!def) return null;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.sticker,
          { width: naturalWidth, height: naturalHeight },
          animatedStyle,
        ]}>
        {def.svgXml ? (
          <SvgXml
            xml={themedSvgXml ?? def.svgXml}
            width="100%"
            height="100%"
          />
        ) : def.source ? (
          <Image source={def.source} style={StyleSheet.absoluteFill} contentFit="contain" />
        ) : null}
        {isSelected && (
          // Ring rendu en sibling absolu : insets négatifs ⇒ ring dessiné à
          // l'extérieur du sticker (pas inset à l'intérieur comme le ferait
          // un borderWidth sur le wrapper). La taille visuelle du sticker
          // reste donc constante, et le ring rotate/scale avec lui via le
          // transform du parent.
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -RING_INSET,
              left: -RING_INSET,
              right: -RING_INSET,
              bottom: -RING_INSET,
              borderWidth: RING_WIDTH,
              borderColor: '#c27b52',
              borderRadius: RING_RADIUS,
            }}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  sticker: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
