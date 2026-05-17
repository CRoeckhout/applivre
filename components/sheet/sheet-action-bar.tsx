// Barre d'action flottante pour l'éditeur de fiche. Sticky en bas à
// l'origine, horizontale par défaut. L'utilisateur peut la déplacer (drag
// pan) et toggler l'orientation horizontal/vertical via long press.
//
// Système de positionnement : un seul mode (`position: 'absolute', top: 0,
// left: 0`) — toutes les positions sont gérées via `translateX/Y`. Évite
// les bascules CSS sticky↔drag qui doublaient les insets (la barre se
// retrouvait décalée d'environ `insets.top + insets.bottom` lors du
// premier drag à cause de SafeAreaView qui pad le content area).
//
// Coord system : top:0 = top du parent (KeyboardAvoidingView dans le
// content area de SafeAreaView, donc à insets.top du window top). Les
// bornes du clamp sont calculées dans ce repère parent — la barre reste
// visible dans la zone safe.

import { useThemeColors } from '@/hooks/use-theme-colors';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type SheetActionBarAction = {
  key: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  // Sous-titre optionnel affiché en small muted sous le label dans le
  // MoreMenu (pas affiché dans la barre principale, icon-only là-bas).
  description?: string;
  onPress?: () => void;
  // Met en avant l'action (couleur accent, fond plein) — typiquement pour
  // "Enregistrer" quand il y a du dirty state.
  primary?: boolean;
  // État "on" pour un toggle : disque rempli en accent (même taille qu'un
  // bouton normal, contrairement à primary qui agrandit). Utilisé pour
  // signaler qu'un état est actif (ex : fiche déjà publique).
  active?: boolean;
  // Action destructive (suppression…) : icon + label rendus en rouge dans
  // le MoreMenu pour signaler le caractère non-réversible.
  destructive?: boolean;
  disabled?: boolean;
};

const DESTRUCTIVE_COLOR = '#c8322a';

type Orientation = 'horizontal' | 'vertical';

type Props = {
  actions: SheetActionBarAction[];
  moreActions?: SheetActionBarAction[];
  // Marge additionnelle au-dessus du home indicator dans la position
  // sticky initiale. Permet d'éviter d'overlap avec un FAB par exemple.
  bottomOffset?: number;
};

const BUTTON_SIZE = 64;
const HERO_BUTTON_SIZE = 88;
const HERO_ICON_SIZE = 40;
const BUTTON_GAP = 20;
const BAR_PADDING = 10;
const ICON_SIZE = 30;
const EDGE_MARGIN = 12;

export function SheetActionBar({ actions, moreActions, bottomOffset = 0 }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [moreOpen, setMoreOpen] = useState(false);
  // Rect du bouton "..." dans le repère fenêtre, capturé au tap pour ancrer
  // le MoreMenu juste au-dessus (la barre étant draggable, on ne peut pas
  // hardcoder une position).
  const [moreAnchor, setMoreAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const moreButtonRef = useRef<View>(null);

  const openMore = () => {
    moreButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMoreAnchor({ x, y, width, height });
      setMoreOpen(true);
    });
  };

  // Translates en coord parent (KAV). Tant que pas mesuré, hidden via opacity.
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  // Mesure de la barre → state React pour réactivité du useEffect.
  const [barLayout, setBarLayout] = useState({ width: 0, height: 0 });

  // `hasDragged` : false tant que l'utilisateur n'a jamais drag → la barre
  // suit la position sticky bottom-center à chaque redimension/toggle.
  // True après 1er drag → on garde la position de l'utilisateur (juste
  // re-clamp dans le viewport).
  const [hasDragged, setHasDragged] = useState(false);
  const hasDraggedShared = useSharedValue(false);

  useEffect(() => {
    hasDraggedShared.value = hasDragged;
  }, [hasDragged, hasDraggedShared]);

  // Bornes du translate dans le repère parent. Aire utilisable = aire visible
  // du parent (= window - insets.top - insets.bottom puisque parent vit dans
  // le content area de SafeAreaView).
  const minTx = useSharedValue(0);
  const maxTx = useSharedValue(0);
  const minTy = useSharedValue(0);
  const maxTy = useSharedValue(0);

  useEffect(() => {
    if (barLayout.width === 0 || barLayout.height === 0) return;
    const availW = windowWidth;
    const availH = Math.max(0, windowHeight - insets.top - insets.bottom);
    minTx.value = 0;
    maxTx.value = Math.max(0, availW - barLayout.width);
    minTy.value = 0;
    maxTy.value = Math.max(0, availH - barLayout.height);
    if (!hasDraggedShared.value) {
      // Position sticky bottom-center.
      tx.value = (availW - barLayout.width) / 2;
      ty.value = Math.max(0, availH - barLayout.height - EDGE_MARGIN - bottomOffset);
    } else {
      // Re-clamp si la barre s'est retrouvée hors champ.
      tx.value = Math.max(minTx.value, Math.min(maxTx.value, tx.value));
      ty.value = Math.max(minTy.value, Math.min(maxTy.value, ty.value));
    }
  }, [
    barLayout.width,
    barLayout.height,
    windowWidth,
    windowHeight,
    insets.top,
    insets.bottom,
    bottomOffset,
    tx,
    ty,
    hasDraggedShared,
    minTx,
    maxTx,
    minTy,
    maxTy,
  ]);

  const pan = Gesture.Pan()
    .activeOffsetX([-5, 5])
    .activeOffsetY([-5, 5])
    .onStart(() => {
      'worklet';
      if (!hasDraggedShared.value) {
        hasDraggedShared.value = true;
        runOnJS(setHasDragged)(true);
      }
      savedX.value = tx.value;
      savedY.value = ty.value;
    })
    .onUpdate((e) => {
      'worklet';
      const nx = savedX.value + e.translationX;
      const ny = savedY.value + e.translationY;
      tx.value = Math.max(minTx.value, Math.min(maxTx.value, nx));
      ty.value = Math.max(minTy.value, Math.min(maxTy.value, ny));
    })
    .onEnd(() => {
      tx.value = withSpring(tx.value, { damping: 18 });
      ty.value = withSpring(ty.value, { damping: 18 });
    });

  const longPress = Gesture.LongPress()
    .minDuration(400)
    .onStart(() => {
      runOnJS(toggleOrientation)();
    });

  function toggleOrientation() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'));
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    // Hidden tant qu'on n'a pas mesuré la barre — évite un flash au
    // coin haut-gauche au tout premier render.
    opacity: barLayout.width > 0 ? 1 : 0,
  }));

  // Double-tap pour reset à la position sticky bottom-center.
  const lastTapRef = useRef(0);
  const onBarTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      hasDraggedShared.value = false;
      setHasDragged(false);
      const availW = windowWidth;
      const availH = Math.max(0, windowHeight - insets.top - insets.bottom);
      tx.value = withSpring((availW - barLayout.width) / 2);
      ty.value = withSpring(Math.max(0, availH - barLayout.height - EDGE_MARGIN - bottomOffset));
    }
    lastTapRef.current = now;
  };

  return (
    <>
      <GestureDetector gesture={Gesture.Simultaneous(pan, longPress)}>
        <Animated.View
          pointerEvents="box-none"
          style={[
            { position: 'absolute', top: 0, left: 0 },
            animatedStyle,
          ]}>
          <Pressable onPress={onBarTap} accessibilityLabel="Barre d'action">
            <View
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width !== barLayout.width || height !== barLayout.height) {
                  setBarLayout({ width, height });
                }
              }}
              style={{
                flexDirection: orientation === 'horizontal' ? 'row' : 'column',
                alignItems: 'center',
                gap: BUTTON_GAP,
                padding: BAR_PADDING,
                borderRadius: 999,
                backgroundColor: theme.paper,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8,
                borderWidth: 1,
                borderColor: theme.paperShade,
                // Le bouton "hero" (Enregistrer) déborde au-dessus/en dessous
                // de la barre — sans `overflow: 'visible'` Android le clip.
                overflow: 'visible',
              }}>
              {actions.map((a) => (
                <ActionButton key={a.key} action={a} theme={theme} />
              ))}
              {moreActions && moreActions.length > 0 ? (
                <View ref={moreButtonRef} collapsable={false}>
                  <ActionButton
                    action={{
                      key: '__more__',
                      icon: 'more-horiz',
                      label: 'Plus',
                      onPress: openMore,
                    }}
                    theme={theme}
                  />
                </View>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>

      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        actions={moreActions ?? []}
        theme={theme}
        anchor={moreAnchor}
      />
    </>
  );
}

function ActionButton({
  action,
  theme,
}: {
  action: SheetActionBarAction;
  theme: ReturnType<typeof useThemeColors>;
}) {
  // `primary` = action héroïque (Enregistrer) : disque plus large que la
  // barre, fond accent plein + icône blanche, débord au-dessus/en-dessous.
  // `active` = toggle on : même taille qu'un bouton normal, disque
  // accent-pale + icône accent (look "highlighted" plus doux que primary,
  // suffisant pour différencier l'état actif sans crier visuellement).
  const hero = !!action.primary;
  const active = !!action.active;
  const size = hero ? HERO_BUTTON_SIZE : BUTTON_SIZE;
  const iconSize = hero ? HERO_ICON_SIZE : ICON_SIZE;
  const bg = hero
    ? theme.accent
    : active
      ? theme.accentPale
      : 'transparent';
  const fg = hero
    ? '#fbf8f4'
    : active
      ? theme.accent
      : action.disabled
        ? theme.inkMuted
        : theme.ink;
  return (
    <Pressable
      onPress={
        action.disabled
          ? undefined
          : () => {
              Haptics.selectionAsync();
              action.onPress?.();
            }
      }
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: action.disabled }}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : action.disabled ? 0.4 : 1,
        ...(hero
          ? {
              shadowColor: '#000',
              shadowOpacity: 0.22,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }
          : null),
      })}>
      <MaterialIcons name={action.icon} size={iconSize} color={fg} />
    </Pressable>
  );
}

function MoreMenu({
  open,
  onClose,
  actions,
  theme,
  anchor,
}: {
  open: boolean;
  onClose: () => void;
  actions: SheetActionBarAction[];
  theme: ReturnType<typeof useThemeColors>;
  anchor: { x: number; y: number; width: number; height: number } | null;
}) {
  // Pattern visuel aligné sur HomeCogMenu (cf. components/home-cog-menu.tsx) :
  // card rounded-2xl bg-paper shadow, rows icon + titre + sous-titre +
  // chevron, backdrop bg-ink/50.
  //
  // Positionnement dynamique : la barre étant draggable, on ancre le menu
  // par rapport au rect du bouton "..." mesuré au tap (cf. openMore).
  // - Si le bouton est dans la moitié BASSE de l'écran → menu au-dessus
  //   (bottom = screenHeight - anchor.y + GAP, le menu grandit vers le haut).
  // - Si le bouton est dans la moitié HAUTE → menu en dessous (top = bas du
  //   bouton + GAP), sinon il serait clipé en haut de l'écran.
  // - `left` centré sur le bouton, clampé pour rester dans l'écran.
  // Fallback corner top-right si pas encore d'anchor (premier render).
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const MENU_WIDTH = 288;
  const EDGE_PADDING = 12;
  const GAP = 12;

  let positionStyle;
  if (anchor) {
    const left = Math.max(
      EDGE_PADDING,
      Math.min(
        screenWidth - MENU_WIDTH - EDGE_PADDING,
        anchor.x + anchor.width / 2 - MENU_WIDTH / 2,
      ),
    );
    const spawnBelow = anchor.y < screenHeight / 2;
    positionStyle = spawnBelow
      ? {
          position: 'absolute' as const,
          width: MENU_WIDTH,
          left,
          top: anchor.y + anchor.height + GAP,
        }
      : {
          position: 'absolute' as const,
          width: MENU_WIDTH,
          left,
          bottom: Math.max(EDGE_PADDING, screenHeight - anchor.y + GAP),
        };
  } else {
    positionStyle = {
      position: 'absolute' as const,
      width: MENU_WIDTH,
      right: 24,
      top: 88,
    };
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/50">
        <Animated.View
          entering={FadeIn.duration(180)}
          className="overflow-hidden rounded-2xl bg-paper shadow-lg"
          style={[positionStyle, { elevation: 6 }]}>
          {actions.map((a, idx) => (
            <Pressable
              key={a.key}
              onPress={
                a.disabled
                  ? undefined
                  : () => {
                      Haptics.selectionAsync();
                      onClose();
                      a.onPress?.();
                    }
              }
              accessibilityLabel={a.label}
              accessibilityState={{ disabled: a.disabled }}
              className={`px-4 py-3 ${idx === 0 ? '' : 'border-t border-paper-warm'} ${a.disabled ? 'opacity-40' : 'active:bg-paper-warm'}`}>
              <View className="flex-row items-center gap-3">
                <MaterialIcons
                  name={a.icon}
                  size={20}
                  color={a.destructive ? DESTRUCTIVE_COLOR : theme.ink}
                />
                <View className="flex-1">
                  <Text
                    className="font-sans-med text-base"
                    style={{ color: a.destructive ? DESTRUCTIVE_COLOR : theme.ink }}>
                    {a.label}
                  </Text>
                  {a.description ? (
                    <Text className="text-xs text-ink-muted">
                      {a.description}
                    </Text>
                  ) : null}
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={theme.inkMuted}
                />
              </View>
            </Pressable>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
