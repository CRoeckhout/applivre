import { useBookshelf } from '@/store/bookshelf';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

type Cell = {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  count: number;
  onPress: () => void;
};

export function ReadingStatsCard() {
  const router = useRouter();
  const books = useBookshelf((s) => s.books);

  const counts = useMemo(
    () => ({
      wishlist: books.filter((b) => b.status === 'wishlist').length,
      reading: books.filter((b) => b.status === 'reading').length,
      read: books.filter((b) => b.status === 'read').length,
      favorite: books.filter((b) => b.favorite).length,
    }),
    [books],
  );

  const cells: Cell[] = [
    {
      label: 'Wishlist',
      icon: 'bookmark',
      color: '#d4a017',
      count: counts.wishlist,
      onPress: () =>
        router.push({ pathname: '/library', params: { status: 'wishlist' } }),
    },
    {
      label: 'En cours',
      icon: 'auto-stories',
      color: '#8e5dc8',
      count: counts.reading,
      onPress: () =>
        router.push({ pathname: '/library', params: { status: 'reading' } }),
    },
    {
      label: 'Lu',
      icon: 'check-circle',
      color: '#5fa84d',
      count: counts.read,
      onPress: () =>
        router.push({ pathname: '/library', params: { status: 'read' } }),
    },
    {
      label: "J'aime",
      icon: 'favorite',
      color: '#d4493e',
      count: counts.favorite,
      onPress: () =>
        router.push({ pathname: '/library', params: { favorite: '1' } }),
    },
  ];

  return (
    <View className="mt-4 flex-row gap-2">
      {cells.map((c) => (
        <StatCell key={c.label} cell={c} />
      ))}
    </View>
  );
}

function StatCell({ cell }: { cell: Cell }) {
  return (
    <Pressable
      onPress={cell.onPress}
      className="flex-1 rounded-2xl bg-paper-warm p-3 active:opacity-80">
      <View
        style={{ backgroundColor: cell.color }}
        className="h-7 w-7 items-center justify-center rounded-full">
        <MaterialIcons name={cell.icon} size={16} color="#fbf8f4" />
      </View>
      <Text
        className="mt-2 font-display text-2xl text-ink"
        style={{ fontVariant: ['tabular-nums'] }}>
        {cell.count}
      </Text>
      <Text numberOfLines={1} className="text-xs text-ink-muted">
        {cell.label}
      </Text>
    </Pressable>
  );
}
