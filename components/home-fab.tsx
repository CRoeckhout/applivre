import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

export function HomeFab() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const onAddBook = () => {
    close();
    router.push('/scanner');
  };

  const onAddSheet = () => {
    close();
    router.push('/sheet/new');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Ajouter"
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg active:opacity-80"
        style={{ elevation: 4 }}>
        <MaterialIcons name="add" size={28} color="#fbf8f4" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable onPress={close} className="flex-1 justify-end bg-ink/60">
          <Animated.View
            entering={FadeIn.duration(200)}
            className="rounded-t-3xl bg-paper px-6 pb-10 pt-6">
            <View className="mb-2 h-1 w-10 self-center rounded-full bg-paper-shade" />
            <Text className="mt-3 mb-5 font-display text-xl text-ink">Ajouter</Text>

            <ActionRow
              icon="menu-book"
              title="Un livre"
              subtitle="Scanner, recherche ou saisie manuelle"
              onPress={onAddBook}
            />
            <ActionRow
              icon="edit-note"
              title="Une fiche de lecture"
              subtitle="Sélectionne un livre de ta biblio"
              onPress={onAddSheet}
            />

            <Pressable
              onPress={close}
              className="mt-4 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center gap-4 rounded-2xl bg-paper-warm p-4 active:bg-paper-shade">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
        <MaterialIcons name={icon} size={24} color="#fbf8f4" />
      </View>
      <View className="flex-1">
        <Text className="font-display text-base text-ink">{title}</Text>
        <Text className="text-sm text-ink-soft">{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#6b6259" />
    </Pressable>
  );
}
