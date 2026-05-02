import { MaterialIcons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  open: boolean;
  onClose: () => void;
  onPickFrame: () => void;
  onPickPhoto: () => void;
};

// Modal présentée au tap sur l'avatar. Deux gros carrés équivalents :
// "Cadre" (icône cercle) et "Photo" (icône camera). Le tap sur l'un ferme
// la modal et délègue au caller — l'action n'est exécutée qu'une fois la
// modal fully dismissed pour éviter le conflit modal-on-modal sur iOS
// (présenter le picker système ou un autre Modal sur une view encore en
// cours de dismiss fait fail le picker silencieusement, ou déclenche des
// glitches d'affichage).
export function AvatarActionModal({
  open,
  onClose,
  onPickFrame,
  onPickPhoto,
}: Props) {
  const insets = useSafeAreaInsets();
  // Action choisie en attente : exécutée dans `onDismiss` (iOS) une fois
  // l'animation de fade-out terminée. Sur Android, `onDismiss` ne fire pas
  // — on déclenche directement (l'ImagePicker lance un Intent vers une
  // Activity séparée, donc pas de conflit avec la modal en cours de fermeture).
  const pendingActionRef = useRef<(() => void) | null>(null);

  function trigger(action: () => void) {
    if (Platform.OS === 'ios') {
      pendingActionRef.current = action;
      onClose();
    } else {
      onClose();
      action();
    }
  }

  return (
    <Modal
      visible={open}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      onDismiss={() => {
        const pending = pendingActionRef.current;
        pendingActionRef.current = null;
        pending?.();
      }}
      statusBarTranslucent>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(26,20,16,0.45)',
          justifyContent: 'flex-end',
        }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#fbf8f4',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 20 + insets.bottom,
          }}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="font-display text-lg text-ink">Photo de profil</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
              <MaterialIcons name="close" size={18} color="rgb(58 50 43)" />
            </Pressable>
          </View>

          <View className="flex-row gap-3">
            <ActionTile
              icon="circle"
              label="Cadre"
              onPress={() => trigger(onPickFrame)}
            />
            <ActionTile
              icon="photo-camera"
              label="Photo"
              onPress={() => trigger(onPickPhoto)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, aspectRatio: 1 }}
      className="items-center justify-center gap-3 rounded-3xl border border-paper-warm bg-paper-warm/40 active:bg-paper-warm">
      <MaterialIcons name={icon} size={48} color="rgb(58 50 43)" />
      <Text className="font-sans-med text-base text-ink">{label}</Text>
    </Pressable>
  );
}
