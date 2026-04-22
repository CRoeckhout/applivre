import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

export function HomeCogMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Réglages de l'accueil"
        hitSlop={8}
        className="h-12 w-12 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
        <MaterialIcons name="settings" size={22} color="#3a322b" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 bg-ink/50">
          <Animated.View
            entering={FadeIn.duration(180)}
            className="absolute right-6 w-72 overflow-hidden rounded-2xl bg-paper shadow-lg"
            style={{ top: 88, elevation: 6 }}>
            <View className="px-4 py-3 opacity-50">
              <View className="flex-row items-center gap-3">
                <MaterialIcons name="palette" size={20} color="#3a322b" />
                <View className="flex-1">
                  <Text className="font-sans-med text-base text-ink">Apparence</Text>
                  <Text className="text-xs text-ink-muted">Bientôt : thème, police, couleurs</Text>
                </View>
              </View>
            </View>
            <View className="border-t border-paper-warm px-4 py-3">
              <Text className="text-xs italic text-ink-muted">
                Astuce : appuie longuement sur une carte pour la déplacer.
              </Text>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}
