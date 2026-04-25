import { BookPicker } from '@/components/book-picker';
import { useReadingSheets } from '@/store/reading-sheets';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

export default function NewSheetPicker() {
  const router = useRouter();
  const sheets = useReadingSheets((s) => s.sheets);

  return (
    <BookPicker
      title="Choisir un livre"
      subtitle="Sélectionne le livre pour lequel créer ou éditer une fiche."
      onPick={(ub) => router.replace(`/sheet/${ub.book.isbn}`)}
      emptyBody="Ajoute d'abord un livre à ta bibliothèque. Ensuite tu pourras y associer une fiche."
      renderRight={(ub) =>
        sheets[ub.id] ? (
          <View className="rounded-full bg-accent-pale px-2 py-1">
            <Text className="text-xs text-accent-deep">Fiche en cours</Text>
          </View>
        ) : null
      }
    />
  );
}
