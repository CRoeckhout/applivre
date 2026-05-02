import { AvatarFrame } from '@/components/avatar-frame';
import { type AvatarFrameDef } from '@/lib/avatar-frames/catalog';
import { useAllAvatarFrames } from '@/store/avatar-frame-catalog';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (frameId: string) => void;
  // Avatar URL du user. Utilisée pour afficher chaque cadre avec la vraie
  // photo en preview, plutôt qu'un placeholder. Peut être null (user sans
  // avatar) — fallback sur un cercle accent.
  avatarUrl: string | null;
  // Initiale à afficher si pas d'avatar (cf. user-profile-card).
  initial: string;
  selectedFrameId: string;
};

// Tile = footprint visuel de chaque carte du picker. Plus grand que la
// preview elle-même pour laisser au cadre la place de déborder vers
// l'extérieur (cf. AvatarFrame qui rend la photo à `AVATAR_PREVIEW_SIZE`
// et étend le cadre au-delà).
const TILE_SIZE = 110;
const TILE_GAP = 12;
const AVATAR_PREVIEW_SIZE = 64;

// Modal full-screen pour piocher un cadre photo. Affiche le sentinel "Aucun
// cadre" en premier, suivi des cadres dispo. Tap sur une tuile = applique
// + ferme.
export function AvatarFramePickerModal({
  open,
  onClose,
  onPick,
  avatarUrl,
  initial,
  selectedFrameId,
}: Props) {
  const insets = useSafeAreaInsets();
  const frames = useAllAvatarFrames();

  // Le sentinel 'none' est toujours en tête (déjà premier dans le catalog
  // local), suivi des cadres DB dans l'ordre du fetch.
  const ordered = useMemo(() => frames, [frames]);

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
            <Text className="font-display text-lg text-ink">Cadre photo</Text>
            <Text className="text-xs text-ink-muted">
              Tape pour appliquer un cadre à ta photo de profil
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 16 + insets.bottom,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: TILE_GAP,
          }}>
          {ordered.map((frame) => (
            <FrameTile
              key={frame.id}
              def={frame}
              avatarUrl={avatarUrl}
              initial={initial}
              selected={frame.id === selectedFrameId}
              onPress={() => {
                onPick(frame.id);
                onClose();
              }}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function FrameTile({
  def,
  avatarUrl,
  initial,
  selected,
  onPress,
}: {
  def: AvatarFrameDef;
  avatarUrl: string | null;
  initial: string;
  selected: boolean;
  onPress: () => void;
}) {
  const isNone = def.id === 'none' || !def.source;

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: TILE_SIZE,
        height: TILE_SIZE + 22,
        alignItems: 'center',
        justifyContent: 'flex-start',
      }}>
      <View
        style={{
          width: TILE_SIZE,
          height: TILE_SIZE,
          borderRadius: TILE_SIZE / 2,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? 'rgb(194 123 82)' : 'rgba(107,98,89,0.2)',
          backgroundColor: 'rgba(255,255,255,0.4)',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {/* Réutilise le composant AvatarFrame du runtime : la photo est
            rendue à AVATAR_PREVIEW_SIZE et le cadre déborde vers l'extérieur
            jusqu'aux bords de la tile. La preview matche ainsi exactement
            ce que verra le user dans le profil. */}
        <AvatarFrame size={AVATAR_PREVIEW_SIZE} frameId={def.id}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'rgb(194 123 82)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ color: '#fbf8f4', fontSize: 24, fontWeight: '700' }}>
                {initial}
              </Text>
            </View>
          )}
        </AvatarFrame>
        {isNone && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 6, right: 6 }}>
            <MaterialIcons name="block" size={16} color="rgba(107,98,89,0.6)" />
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 4,
          fontSize: 11,
          color: selected ? 'rgb(58 50 43)' : 'rgb(107 98 89)',
          fontWeight: selected ? '600' : '400',
        }}>
        {def.label}
      </Text>
    </Pressable>
  );
}
