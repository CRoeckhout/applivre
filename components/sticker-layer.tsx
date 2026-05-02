import { Sticker } from '@/components/sticker';
import { StickerToolbar } from '@/components/sticker-toolbar';
import type { PlacedSticker } from '@/types/book';
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

type Props = {
  stickers: PlacedSticker[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateTransform: (
    id: string,
    next: { x: number; y: number; scale: number; rotation: number },
  ) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, direction: 1 | -1) => void;
  // Notification au parent : true ⇒ au moins un doigt sur un sticker, le
  // parent désactive son scroll englobant tant que c'est vrai. Sinon, le
  // ScrollView englobant capte le 2e doigt avant que pinch/rotate puisse
  // s'activer (bug observé sur iOS).
  onInteractChange: (active: boolean) => void;
};

// Hauteur approx. du toolbar — utilisée pour décider s'il faut le poser
// au-dessus ou en-dessous du sticker (flip si pas la place sous).
const TOOLBAR_HEIGHT = 48;
// Marge entre la box du sticker et le toolbar.
const TOOLBAR_OFFSET = 12;
// Largeur fixe du wrapper du toolbar — large enough pour contenir les 3
// boutons + séparateur + paddings (~140-160px en pratique). Le toolbar est
// centré horizontalement à l'intérieur via `alignItems:center`.
const TOOLBAR_WRAPPER_WIDTH = 200;

// Layer absolu posé en sibling de SheetSurface (pas en enfant : SheetSurface
// peut avoir overflow:hidden pour clipper son fond image, ce qui couperait
// les stickers qui dépassent). Bornes du layer = bornes du sibling SheetSurface
// (les deux occupent la même cellule du parent), donc le drag est clampé sur
// la fiche tandis que l'image du sticker peut visuellement dépasser via
// `overflow:'visible'`.
//
// `pointerEvents="box-none"` : la View elle-même ne capte pas les taps —
// seuls ses enfants (stickers + overlay deselect) le font. Sans ça, le layer
// bloquerait les taps destinés au contenu de la fiche en arrière-plan
// (édition de texte, ratings, etc.).
export function StickerLayer({
  stickers,
  selectedId,
  onSelect,
  onUpdateTransform,
  onDelete,
  onReorder,
  onInteractChange,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Counter d'overlapping gestures actifs (4 par sticker × N stickers) — on
  // toggle `onInteractChange(true)` au passage 0→1 et `false` au 1→0. Stocké
  // en ref car on ne re-rend pas le layer pour ça (impact uniquement sur le
  // ScrollView parent).
  const interactCount = useRef(0);
  const onStickerInteractStart = () => {
    interactCount.current += 1;
    if (interactCount.current === 1) onInteractChange(true);
  };
  const onStickerInteractEnd = () => {
    interactCount.current = Math.max(0, interactCount.current - 1);
    if (interactCount.current === 0) onInteractChange(false);
  };

  // Garde-fou : si le compteur reste bloqué > 0 (typt. quand un gesture est
  // recréé par un re-render avant que son onFinalize ne fire — RNGH ne
  // garantit alors plus l'appel), on force un reset à chaque changement
  // de sélection. L'utilisateur est par convention finger-up entre deux
  // sélections, donc remettre le compteur à 0 ici est sûr et résout le
  // bug "scroll bloqué après désélection".
  useEffect(() => {
    interactCount.current = 0;
    onInteractChange(false);
  }, [selectedId, onInteractChange]);

  // Shared values qui suivent la transformation du sticker sélectionné. Le
  // sticker actif y mirroirise sa position via `useAnimatedReaction` ; le
  // toolbar `Animated.View` lit pour se positionner. Tout reste sur le UI
  // thread : drag/pinch/rotate du sticker → toolbar suit à 60fps.
  const selCenterX = useSharedValue(0);
  const selCenterY = useSharedValue(0);
  const selHalfHeight = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  // Un sticker peut être posé en dehors de l'arbre du layer si la fiche
  // n'a pas encore été mesurée. On défère le rendu enfant tant que size=0
  // pour éviter des positions absurdes (x=0,y=0 = coin haut-gauche).
  const ready = size.w > 0 && size.h > 0;
  const selectedIdx = stickers.findIndex((s) => s.id === selectedId);
  const hasSelection = selectedId !== null && selectedIdx >= 0;

  // Position du toolbar en suivi temps réel : par défaut juste sous la box
  // visible du sticker, et flip au-dessus si on dépasse en bas du layer.
  // Le wrapper a une largeur fixe (TOOLBAR_WRAPPER_WIDTH) avec `alignItems:
  // center` pour centrer le toolbar dedans ; le translateX décale le wrapper
  // pour que son centre se trouve au centreX du sticker.
  const toolbarStyle = useAnimatedStyle(() => {
    const bottomY = selCenterY.value + selHalfHeight.value + TOOLBAR_OFFSET;
    const wouldOverflow = bottomY + TOOLBAR_HEIGHT > size.h;
    const y = wouldOverflow
      ? selCenterY.value - selHalfHeight.value - TOOLBAR_OFFSET - TOOLBAR_HEIGHT
      : bottomY;
    return {
      transform: [
        { translateX: selCenterX.value - TOOLBAR_WRAPPER_WIDTH / 2 },
        { translateY: Math.max(0, y) },
      ],
    };
  }, [size.h]);

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, { overflow: 'visible' }]}>
      {/* Overlay de désélection : actif uniquement quand un sticker est
          sélectionné. Il couvre la zone du layer SOUS les stickers (les
          stickers, montés après, sont au-dessus dans le z natif RN). Tap
          n'importe où en dehors d'un sticker ⇒ déselection. */}
      {hasSelection && (
        <Pressable
          onPress={() => onSelect(null)}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {ready &&
        stickers.map((s) => (
          <Sticker
            key={s.id}
            placement={s}
            layerWidth={size.w}
            layerHeight={size.h}
            isSelected={s.id === selectedId}
            onSelect={() => onSelect(s.id)}
            onCommit={(t) => onUpdateTransform(s.id, t)}
            selectionRefs={{
              centerX: selCenterX,
              centerY: selCenterY,
              halfHeight: selHalfHeight,
            }}
            onInteractStart={onStickerInteractStart}
            onInteractEnd={onStickerInteractEnd}
          />
        ))}
      {hasSelection && selectedId && (
        // Wrapper Animated qui suit la position du sticker sélectionné. Le
        // `StickerToolbar` lui-même reste un composant pur ; c'est ce wrapper
        // qui anime la position. `pointerEvents="box-none"` pour laisser les
        // taps tomber sur les boutons internes de la barre.
        <Animated.View
          pointerEvents="box-none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              width: TOOLBAR_WRAPPER_WIDTH,
              alignItems: 'center',
            },
            toolbarStyle,
          ]}>
          <StickerToolbar
            onDelete={() => onDelete(selectedId)}
            onLayerUp={() => onReorder(selectedId, 1)}
            onLayerDown={() => onReorder(selectedId, -1)}
            canLayerUp={selectedIdx < stickers.length - 1}
            canLayerDown={selectedIdx > 0}
          />
        </Animated.View>
      )}
    </View>
  );
}
