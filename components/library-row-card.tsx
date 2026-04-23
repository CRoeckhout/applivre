import { BookCover } from '@/components/book-cover';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

const MAX_COVERS = 6;

type Props = {
  books: UserBook[];
  onPress: () => void;
  onLongPress?: () => void;
  isDragging?: boolean;
};

export function LibraryRowCard({ books, onPress, onLongPress, isDragging = false }: Props) {
  const theme = useThemeColors();
  // Pile déjà triée par date d'ajout décroissante dans le store (prepend).
  // On prend les N premières couvertures existantes.
  const recents = books.slice(0, MAX_COVERS);
  const count = books.length;
  const subtitle =
    count === 0
      ? 'Commence ta collection'
      : `${count} livre${count > 1 ? 's' : ''} dans ta collection`;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      className={`rounded-3xl p-5 ${isDragging ? 'bg-accent-pale' : 'bg-paper-warm active:bg-paper-shade'}`}
      style={
        isDragging
          ? {
              shadowColor: '#1a1410',
              shadowOpacity: 0.18,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }
          : undefined
      }>
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-pale">
          <MaterialIcons name="menu-book" size={24} color={theme.accentDeep} />
        </View>
        <View className="flex-1">
          <Text className="font-display text-lg text-ink">Ma bibliothèque</Text>
          <Text className="text-sm text-ink-soft">{subtitle}</Text>
        </View>
        <MaterialIcons
          name={isDragging ? 'drag-handle' : 'chevron-right'}
          size={24}
          color={theme.inkMuted}
        />
      </View>

      {recents.length > 0 && (
        <View className="mt-4 flex-row" style={{ gap: 8 }}>
          {recents.map((ub) => (
            <View key={ub.id} style={{ flex: 1 }}>
              <BookCover
                isbn={ub.book.isbn}
                coverUrl={ub.book.coverUrl}
                placeholderText={ub.book.title}
                style={{
                  width: '100%',
                  aspectRatio: 2 / 3,
                  borderRadius: 6,
                }}
              />
            </View>
          ))}
          {Array.from({ length: Math.max(0, MAX_COVERS - recents.length) }).map((_, i) => (
            <View key={`gap-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      )}
    </Pressable>
  );
}
