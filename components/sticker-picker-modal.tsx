import { LockOverlay } from '@/components/lock-overlay';
import { PremiumPaywallModal } from '@/components/premium-paywall-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { applyTokens } from '@/lib/decorations/tokens';
import { type StickerDef } from '@/lib/stickers/catalog';
import { useAllStickers } from '@/store/sticker-catalog';
import { usePreferences } from '@/store/preferences';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (stickerId: string) => void;
  // Nombre de stickers déjà placés sur la fiche. Affiché dans le subtitle
  // pour que l'utilisateur sache où il en est avant de buter sur la limite.
  placedCount: number;
  // Limite max (généralement MAX_STICKERS_PER_SHEET). Quand `placedCount >=
  // max`, on remplace la grille par un message explicite — le tap sur une
  // tuile serait sinon silencieusement no-op côté store.
  maxCount: number;
};

const TILE_SIZE = 96;
const TILE_GAP = 10;

// Modal full-screen pour piocher un sticker dans le catalog. Le user-flow est
// volontairement minimal : tap sur une tuile = pose le sticker + ferme la
// modal (auto-close validé). Pas de preview avant placement, pas de drag
// initial — on place au centre, l'utilisateur ajuste ensuite via la barre.
export function StickerPickerModal({
  open,
  onClose,
  onPick,
  placedCount,
  maxCount,
}: Props) {
  const insets = useSafeAreaInsets();
  const stickers = useAllStickers();
  const [paywall, setPaywall] = useState(false);
  // Filtre : on n'affiche que les stickers ayant une source rendable. Le
  // sentinel "Aucun" n'existe pas pour les stickers (cf. catalog.ts).
  const renderable = useMemo(
    () => stickers.filter((s) => s.source || s.svgXml),
    [stickers],
  );

  const reachedLimit = placedCount >= maxCount;

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: '#fbf8f4',
          paddingTop: insets.top,
        }}>
        <View className="flex-row items-center justify-between border-b border-paper-warm px-4 py-3">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
            <MaterialIcons name="close" size={20} color="rgb(58 50 43)" />
          </Pressable>
          <View className="flex-1 px-3">
            <Text className="font-display text-lg text-ink">
              Stickers · {placedCount}/{maxCount}
            </Text>
            <Text className="text-xs text-ink-muted">
              {reachedLimit
                ? 'Limite atteinte — supprime un sticker pour en ajouter'
                : 'Tape pour ajouter à ta fiche'}
            </Text>
          </View>
        </View>

        {reachedLimit ? (
          <View className="flex-1 items-center justify-center px-6">
            <MaterialIcons name="info-outline" size={32} color="rgb(107 98 89)" />
            <Text className="mt-3 text-center font-sans-med text-ink">
              Limite atteinte
            </Text>
            <Text className="mt-1 text-center text-sm text-ink-muted">
              Tu peux placer jusqu&apos;à 20 stickers par fiche. Supprimes-en
              un pour en ajouter un nouveau.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 16 + insets.bottom,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: TILE_GAP,
            }}>
            {renderable.length === 0 ? (
              <View className="flex-1 items-center px-6 py-12">
                <MaterialIcons
                  name="emoji-emotions"
                  size={32}
                  color="rgb(107 98 89)"
                />
                <Text className="mt-3 text-center text-sm text-ink-muted">
                  Aucun sticker disponible pour l&apos;instant.
                </Text>
              </View>
            ) : (
              renderable.map((s) => (
                <StickerTile
                  key={s.id}
                  def={s}
                  onPress={() => {
                    if (s.locked) {
                      setPaywall(true);
                      return;
                    }
                    onPick(s.id);
                    onClose();
                  }}
                />
              ))
            )}
          </ScrollView>
        )}
        <PremiumPaywallModal
          open={paywall}
          reason="premium"
          onClose={() => setPaywall(false)}
        />
      </View>
    </Modal>
  );
}

// Tuile preview d'un sticker dans la grille du picker. Reproduit la même
// résolution de tokens SVG que le rendu final, pour que la preview matche
// ce qui sera posé.
function StickerTile({ def, onPress }: { def: StickerDef; onPress: () => void }) {
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const theme = useThemeColors();

  const themedSvgXml = useMemo(() => {
    if (!def.svgXml) return undefined;
    return applyTokens(
      def.svgXml,
      def.tokens,
      { colorPrimary, colorSecondary, colorBg },
      theme,
    );
  }, [def.svgXml, def.tokens, colorPrimary, colorSecondary, colorBg, theme]);

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(107,98,89,0.2)',
        backgroundColor: 'rgba(255,255,255,0.4)',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
      }}>
      <View style={{ width: '100%', height: '100%' }}>
        {def.svgXml ? (
          <SvgXml xml={themedSvgXml ?? def.svgXml} width="100%" height="100%" />
        ) : def.source ? (
          <Image
            source={def.source}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
          />
        ) : null}
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingVertical: 4,
          paddingHorizontal: 6,
          backgroundColor: 'rgba(255,255,255,0.85)',
        }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 10, color: 'rgb(58 50 43)', textAlign: 'center' }}>
          {def.label}
        </Text>
      </View>
      {def.lockReason && <LockOverlay />}
    </Pressable>
  );
}
