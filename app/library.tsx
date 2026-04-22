import { BookCover } from '@/components/book-cover';
import { useBookshelf } from '@/store/bookshelf';
import type { ReadingStatus, UserBook } from '@/types/book';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type FilterValue = 'all' | ReadingStatus;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'reading', label: 'En cours' },
  { value: 'to_read', label: 'À lire' },
  { value: 'read', label: 'Lus' },
  { value: 'abandoned', label: 'Abandonnés' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const [filter, setFilter] = useState<FilterValue>('all');

  const counts = useMemo(
    () => ({
      reading: books.filter((b) => b.status === 'reading').length,
      read: books.filter((b) => b.status === 'read').length,
      to_read: books.filter((b) => b.status === 'to_read').length,
    }),
    [books],
  );

  const filtered = filter === 'all' ? books : books.filter((b) => b.status === filter);

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-24">
        <Animated.View entering={FadeInDown.duration(400)} className="flex-row gap-3">
          <StatCard label="En cours" value={String(counts.reading)} />
          <StatCard label="Terminés" value={String(counts.read)} />
          <StatCard label="À lire" value={String(counts.to_read)} />
        </Animated.View>

        {books.length === 0 ? (
          <EmptyState onAdd={() => router.push('/scanner')} />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="mt-6 gap-2 pb-2">
              {FILTERS.map((f) => {
                const active = filter === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => setFilter(f.value)}
                    className={`rounded-full px-4 py-2 ${active ? 'bg-ink' : 'bg-paper-warm'}`}>
                    <Text className={active ? 'text-paper' : 'text-ink'}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View className="mt-6 flex-row flex-wrap" style={{ gap: 16 }}>
              {filtered.map((ub) => (
                <BookTile key={ub.id} book={ub} onPress={() => router.push(`/book/${ub.book.isbn}`)} />
              ))}
              {filtered.length === 0 && (
                <Text className="w-full py-8 text-center text-ink-muted">
                  Aucun livre dans cette catégorie.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-paper-warm p-4">
      <Text className="font-display text-3xl text-ink">{value}</Text>
      <Text className="mt-1 text-sm text-ink-muted">{label}</Text>
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(600).delay(200)}
      className="mt-10 items-center rounded-3xl bg-paper-warm p-8">
      <Text className="text-center font-display text-2xl text-ink">Encore vide</Text>
      <Text className="mt-2 text-center text-ink-muted">
        Scanne un code-barres ou cherche un livre pour commencer ta collection.
      </Text>
      <Pressable onPress={onAdd} className="mt-6 rounded-full bg-accent px-6 py-3 active:opacity-80">
        <Text className="font-sans-med text-paper">Ajouter un livre</Text>
      </Pressable>
    </Animated.View>
  );
}

function BookTile({ book, onPress }: { book: UserBook; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: '47%' }} className="active:opacity-70">
      <BookCover
        isbn={book.book.isbn}
        coverUrl={book.book.coverUrl}
        style={{ width: '100%', aspectRatio: 2 / 3, borderRadius: 10 }}
        placeholderText={book.book.title}
      />
      <Text numberOfLines={2} className="mt-2 font-display text-sm text-ink">
        {book.book.title}
      </Text>
      {book.book.authors[0] ? (
        <Text numberOfLines={1} className="text-xs text-ink-muted">
          {book.book.authors[0]}
        </Text>
      ) : null}
    </Pressable>
  );
}
