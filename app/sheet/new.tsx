import { BookPicker } from '@/components/book-picker';
import { useReadingSheets } from '@/store/reading-sheets';
import type { ReadingStatus } from '@/types/book';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

const STATUS_LABEL: Record<ReadingStatus, string> = {
  wishlist: 'Wishlist',
  to_read: 'À lire',
  reading: 'En cours',
  paused: 'En pause',
  read: 'Lu',
  abandoned: 'Abandonné',
};

export default function NewSheetPicker() {
  const router = useRouter();
  const sheets = useReadingSheets((s) => s.sheets);

  return (
    <BookPicker
      title="Choisir un livre"
      subtitle="Sélectionne le livre pour lequel créer ou éditer une fiche."
      onPick={(ub) => router.replace(`/sheet/${ub.book.isbn}`)}
      emptyBody="Ajoute d'abord un livre à ta bibliothèque. Ensuite tu pourras y associer une fiche."
      restrictToRead
      renderRight={(ub) => {
        if (sheets[ub.id]) {
          return (
            <View className="rounded-full bg-accent-pale px-2 py-1">
              <Text className="text-xs text-accent-deep">Fiche existante</Text>
            </View>
          );
        }
        if (ub.status !== 'read') {
          return (
            <View className="rounded-full bg-paper-shade px-2 py-1">
              <Text className="text-xs text-ink-muted">{STATUS_LABEL[ub.status]}</Text>
            </View>
          );
        }
        return null;
      }}
    />
  );
}
