import { BookCover } from '@/components/book-cover';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { search, type SearchResult } from '@/lib/books';
import { useBookshelf } from '@/store/bookshelf';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

function navigateToManualEntry(router: ReturnType<typeof useRouter>, prefillTitle?: string) {
  router.push({
    pathname: '/book-manual',
    params: prefillTitle ? { title: prefillTitle } : {},
  });
}

export function SearchMode() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 350);
  const hasBook = useBookshelf((s) => s.hasBook);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => search(debounced),
    enabled: debounced.trim().length >= 2,
    placeholderData: (prev) => prev,
  });

  return (
    <View className="flex-1">
      <View className="px-6 pt-4">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Titre, auteur, ou ISBN…"
          placeholderTextColor="#6b6259"
          autoCorrect={false}
          autoCapitalize="none"
          className="rounded-2xl bg-paper-warm px-5 py-4 text-base text-ink"
        />
        {isFetching && debounced.length >= 2 && (
          <ActivityIndicator color="#c27b52" style={{ marginTop: 12 }} />
        )}
      </View>

      <ScrollView contentContainerClassName="px-6 pb-24 pt-2" keyboardShouldPersistTaps="handled">
        {debounced.length < 2 && !isLoading && (
          <Text className="mt-12 text-center text-ink-muted">
            Tape au moins deux lettres pour chercher.
          </Text>
        )}

        {data?.length === 0 && debounced.length >= 2 && !isFetching && (
          <View className="mt-12 items-center">
            <Text className="text-center text-ink-muted">
              Aucun résultat pour « {debounced} ».
            </Text>
            <Pressable
              onPress={() => navigateToManualEntry(router, debounced)}
              className="mt-5 rounded-full bg-accent px-5 py-3 active:opacity-80">
              <Text className="font-sans-med text-paper">+ Saisir manuellement</Text>
            </Pressable>
          </View>
        )}

        {data?.map((r, i) => (
          <Animated.View key={`${r.isbn}-${i}`} entering={FadeIn.duration(220).delay(i * 20)}>
            <ResultRow result={r} owned={hasBook(r.isbn)} onPress={() => router.push(`/book/${r.isbn}`)} />
          </Animated.View>
        ))}

        {data && data.length > 0 && (
          <Pressable
            onPress={() => navigateToManualEntry(router, debounced)}
            className="mt-6 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
            <Text className="text-center text-sm text-ink-muted">
              Pas le bon livre ? Saisir manuellement
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function ResultRow({
  result,
  owned,
  onPress,
}: {
  result: SearchResult;
  owned: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-3 flex-row items-center gap-3 rounded-2xl bg-paper-warm p-3 active:bg-paper-shade">
      <BookCover
        isbn={result.isbn}
        coverUrl={result.coverUrl}
        style={{ width: 48, height: 72, borderRadius: 6 }}
      />
      <View className="flex-1">
        <Text numberOfLines={2} className="font-display text-base text-ink">
          {result.title}
        </Text>
        {result.authors[0] ? (
          <Text numberOfLines={1} className="text-sm text-ink-soft">
            {result.authors.slice(0, 2).join(', ')}
          </Text>
        ) : null}
        <View className="mt-1 flex-row gap-2">
          {result.year ? <Text className="text-xs text-ink-muted">{result.year}</Text> : null}
          {result.pages ? (
            <Text className="text-xs text-ink-muted">· {result.pages} p.</Text>
          ) : null}
        </View>
      </View>
      {owned && (
        <View className="rounded-full bg-accent-pale px-2 py-1">
          <Text className="text-xs text-accent-deep">Dans ta biblio</Text>
        </View>
      )}
    </Pressable>
  );
}
