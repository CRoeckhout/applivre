import { BookCover } from '@/components/book-cover';
import { useBookshelf } from '@/store/bookshelf';
import { useReadingSheets } from '@/store/reading-sheets';
import type { UserBook } from '@/types/book';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NewSheetPicker() {
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const sheets = useReadingSheets((s) => s.sheets);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.book.title.toLowerCase().includes(q) ||
        b.book.authors.some((a) => a.toLowerCase().includes(q)),
    );
  }, [books, query]);

  const go = (ub: UserBook) => router.replace(`/sheet/${ub.book.isbn}`);

  if (books.length === 0) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper px-8" edges={['bottom']}>
        <Text className="font-display text-2xl text-ink">Bibliothèque vide</Text>
        <Text className="mt-2 text-center text-ink-muted">
          Ajoute d&apos;abord un livre à ta bibliothèque. Ensuite tu pourras y associer une fiche.
        </Text>
        <Pressable
          onPress={() => router.replace('/(tabs)/scanner')}
          className="mt-6 rounded-full bg-accent px-6 py-3 active:opacity-80">
          <Text className="font-sans-med text-paper">Ajouter un livre</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <View className="px-6 pt-4">
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text className="font-display text-2xl text-ink">Choisir un livre</Text>
            <Text className="mt-1 text-sm text-ink-muted">
              Sélectionne le livre pour lequel créer ou éditer une fiche.
            </Text>
          </Animated.View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher dans ma biblio"
            placeholderTextColor="#6b6259"
            autoCorrect={false}
            autoCapitalize="none"
            className="mt-4 rounded-2xl bg-paper-warm px-5 py-3 text-base text-ink"
          />
        </View>

        <ScrollView
          contentContainerClassName="px-6 pt-4 pb-24"
          keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <Text className="mt-12 text-center text-ink-muted">
              Aucun livre ne correspond.
            </Text>
          ) : (
            <View className="gap-2">
              {filtered.map((ub, i) => {
                const hasSheet = !!sheets[ub.id];
                return (
                  <Animated.View key={ub.id} entering={FadeIn.duration(220).delay(i * 20)}>
                    <Pressable
                      onPress={() => go(ub)}
                      className="flex-row items-center gap-3 rounded-2xl bg-paper-warm p-3 active:bg-paper-shade">
                      <BookCover
                        isbn={ub.book.isbn}
                        coverUrl={ub.book.coverUrl}
                        style={{ width: 44, height: 66, borderRadius: 6 }}
                      />
                      <View className="flex-1">
                        <Text numberOfLines={2} className="font-display text-base text-ink">
                          {ub.book.title}
                        </Text>
                        {ub.book.authors[0] ? (
                          <Text numberOfLines={1} className="text-sm text-ink-soft">
                            {ub.book.authors[0]}
                          </Text>
                        ) : null}
                      </View>
                      {hasSheet && (
                        <View className="rounded-full bg-accent-pale px-2 py-1">
                          <Text className="text-xs text-accent-deep">Fiche en cours</Text>
                        </View>
                      )}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
