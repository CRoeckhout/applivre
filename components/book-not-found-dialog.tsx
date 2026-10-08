import { MaterialIcons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';

type Props = {
  // ISBN introuvable à signaler. Null → dialog fermé.
  isbn: string | null;
  onCancel: () => void;
  onSubmit: (isbn: string) => void;
};

// Affiché par le scanner quand `resolve-book` ne trouve le livre sur aucune
// plateforme. Propose de le soumettre aux admins (→ /book-submit).
export function BookNotFoundDialog({ isbn, onCancel, onSubmit }: Props) {
  return (
    <Modal visible={isbn !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} className="flex-1 justify-center bg-ink/60 px-6">
        <Pressable onPress={(e) => e.stopPropagation()} className="rounded-3xl bg-paper p-6">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-paper-warm">
            <MaterialIcons name="search-off" size={24} color="#9b5a38" />
          </View>
          <Text className="mt-4 font-display text-2xl text-ink">Livre introuvable</Text>
          <Text className="mt-2 text-sm text-ink-muted">
            Aucune plateforme ne connaît ce livre. Tu peux le soumettre à l’équipe : il sera
            ajouté tout de suite à ta bibliothèque, puis au catalogue une fois validé.
          </Text>
          {isbn ? (
            <View className="mt-4 self-start rounded-full bg-paper-warm px-3 py-1">
              <Text className="text-xs text-ink-muted">ISBN {isbn}</Text>
            </View>
          ) : null}

          <View className="mt-6 flex-row gap-2">
            <Pressable
              onPress={onCancel}
              className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
            <Pressable
              onPress={() => isbn && onSubmit(isbn)}
              className="flex-1 rounded-full bg-accent py-3 active:opacity-80">
              <Text className="text-center font-sans-med text-paper">Soumettre</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
