import { useOnline } from '@/store/network';
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Bannière hors ligne : petit toast bas non bloquant affiché tant que le réseau
// est indisponible. Tap → modale explicative sur la synchro différée. L'app
// reste pleinement utilisable (données locales persistées + queue d'écritures).
export function OfflineBannerHost() {
  const isOnline = useOnline();
  const insets = useSafeAreaInsets();
  const [modalOpen, setModalOpen] = useState(false);

  if (isOnline) return null;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          // Au-dessus de la tab bar (≈ 49pt) + safe area.
          bottom: insets.bottom + 58,
          paddingHorizontal: 16,
          zIndex: 1000,
          elevation: 1000,
        }}>
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(180)}
          pointerEvents="box-none">
          <Pressable
            onPress={() => setModalOpen(true)}
            accessibilityLabel="Vous utilisez l'application hors ligne. En savoir plus."
            className="flex-row items-center gap-2 self-center rounded-full bg-ink px-4 py-2.5 shadow-lg">
            <MaterialIcons name="cloud-off" size={16} color="#fbf8f4" />
            <Text className="text-sm font-medium text-paper">Utilisation hors ligne</Text>
          </Pressable>
        </Animated.View>
      </View>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}>
        <Pressable
          onPress={() => setModalOpen(false)}
          className="flex-1 items-center justify-center bg-black/40 px-8">
          <Pressable
            onPress={() => {}}
            className="w-full max-w-sm rounded-3xl bg-paper p-6">
            <View className="mb-3 self-center rounded-full bg-ink/5 p-3">
              <MaterialIcons name="cloud-off" size={28} color="#c27b52" />
            </View>
            <Text className="mb-2 text-center font-display text-lg text-ink">
              Mode hors ligne
            </Text>
            <Text className="text-center text-sm leading-5 text-ink/70">
              Vous utilisez l&apos;application hors ligne. Toutes vos actions
              seront synchronisées une fois de retour sur le réseau.
            </Text>
            <Pressable
              onPress={() => setModalOpen(false)}
              className="mt-5 items-center rounded-full bg-ink py-3">
              <Text className="text-sm font-semibold text-paper">J&apos;ai compris</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
