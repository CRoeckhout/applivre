import { MaterialIcons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

type Props = {
  open: boolean;
  hasSheet: boolean;
  onClose: () => void;
  onCreate: () => void;
};

export function CongratsReadModal({ open, hasSheet, onClose, onCreate }: Props) {
  const iconName = hasSheet ? "edit-note" : "celebration";
  const title = hasSheet ? "Mets ta fiche à jour !" : "Félicitations !";
  const body = hasSheet
    ? "Tu as déjà une fiche pour ce livre. Complète-la avec ton avis final !"
    : "Ajoute une fiche de lecture pour dire ce que tu en as pensé.";
  const cta = hasSheet ? "Mettre à jour" : "Créer ma fiche";

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/40 px-8">
        <Animated.View
          entering={FadeIn.duration(220)}
          className="w-full max-w-sm rounded-3xl bg-paper p-6"
        >
          <View className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-pale">
              <MaterialIcons name={iconName} size={30} color="#c27b52" />
            </View>
            <Text className="mt-4 text-center font-display text-2xl text-ink">
              {title}
            </Text>
            <Text className="mt-2 text-center text-base text-ink-soft">
              {body}
            </Text>
          </View>

          <View className="mt-6 gap-2">
            <Pressable
              onPress={onCreate}
              className="items-center rounded-full bg-accent px-5 py-3 active:opacity-80"
            >
              <Text className="font-sans-med text-paper">{cta}</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="items-center rounded-full px-5 py-3 active:bg-paper-warm"
            >
              <Text className="text-ink-muted">Plus tard</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
