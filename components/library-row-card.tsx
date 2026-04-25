import { BookCover } from '@/components/book-cover';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

type StatChip = {
  key: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  count: number;
  onPress: () => void;
};

const MAX_COVERS = 6;

type Props = {
  books: UserBook[];
  onPress: () => void;
  onLongPress?: () => void;
  isDragging?: boolean;
};

export function LibraryRowCard({ books, onPress, onLongPress, isDragging = false }: Props) {
  const theme = useThemeColors();
  const router = useRouter();
  // Pile déjà triée par date d'ajout décroissante dans le store (prepend).
  // On prend les N premières couvertures existantes.
  const recents = books.slice(0, MAX_COVERS);
  const count = books.length;
  const subtitle =
    count === 0
      ? 'Commence ta collection'
      : `${count} livre${count > 1 ? 's' : ''} dans ta collection`;

  const stats: StatChip[] = useMemo(() => {
    const wishlist = books.filter((b) => b.status === 'wishlist').length;
    const reading = books.filter((b) => b.status === 'reading').length;
    const read = books.filter((b) => b.status === 'read').length;
    const favorite = books.filter((b) => b.favorite).length;
    return [
      {
        key: 'wishlist',
        label: 'Wishlist',
        icon: 'bookmark',
        color: '#d4a017',
        count: wishlist,
        onPress: () =>
          router.push({ pathname: '/library', params: { status: 'wishlist' } }),
      },
      {
        key: 'reading',
        label: 'En cours',
        icon: 'auto-stories',
        color: '#8e5dc8',
        count: reading,
        onPress: () =>
          router.push({ pathname: '/library', params: { status: 'reading' } }),
      },
      {
        key: 'read',
        label: 'Lu',
        icon: 'check-circle',
        color: '#5fa84d',
        count: read,
        onPress: () =>
          router.push({ pathname: '/library', params: { status: 'read' } }),
      },
      {
        key: 'favorite',
        label: "J'aime",
        icon: 'favorite',
        color: '#d4493e',
        count: favorite,
        onPress: () =>
          router.push({ pathname: '/library', params: { favorite: '1' } }),
      },
    ];
  }, [books, router]);

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

      {count > 0 && (
        <View className="mt-4 flex-row gap-2">
          {stats.map((s) => (
            <Pressable
              key={s.key}
              onPress={(e) => {
                e.stopPropagation();
                s.onPress();
              }}
              className="flex-1 rounded-2xl bg-paper p-2 active:opacity-80">
              <View className="flex-row items-center gap-2">
                <View
                  style={{ backgroundColor: s.color }}
                  className="h-7 w-7 items-center justify-center rounded-full">
                  <MaterialIcons name={s.icon} size={16} color="#fbf8f4" />
                </View>
                <Text
                  className="font-display text-lg text-ink"
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {s.count}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                className="mt-1 text-center text-[10px] text-ink-muted">
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {recents.length > 0 && (
        <View className="mt-4 flex-row" style={{ gap: 8 }}>
          {recents.map((ub) => (
            <Pressable
              key={ub.id}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/book/${ub.book.isbn}`);
              }}
              style={{ flex: 1 }}
              className="active:opacity-70">
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
            </Pressable>
          ))}
          {Array.from({ length: Math.max(0, MAX_COVERS - recents.length) }).map((_, i) => (
            <View key={`gap-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      )}
    </Pressable>
  );
}
