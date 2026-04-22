import { useBookshelf } from '@/store/bookshelf';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

export function ReadingStatsCard() {
  const books = useBookshelf((s) => s.books);

  const counts = useMemo(
    () => ({
      reading: books.filter((b) => b.status === 'reading').length,
      read: books.filter((b) => b.status === 'read').length,
      to_read: books.filter((b) => b.status === 'to_read').length,
    }),
    [books],
  );

  return (
    <View className="mt-4 flex-row gap-3">
      <StatCell label="En cours" value={counts.reading} />
      <StatCell label="Terminés" value={counts.read} />
      <StatCell label="À lire" value={counts.to_read} />
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 rounded-2xl bg-paper-warm p-4">
      <Text className="font-display text-3xl text-ink">{value}</Text>
      <Text className="mt-1 text-sm text-ink-muted">{label}</Text>
    </View>
  );
}
