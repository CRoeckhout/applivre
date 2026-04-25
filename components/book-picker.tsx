import { BookCover } from '@/components/book-cover';
import { useBookshelf } from '@/store/bookshelf';
import type { UserBook } from '@/types/book';
import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
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

type BookPickerProps = {
  title: string;
  subtitle?: string;
  onPick: (ub: UserBook) => void;
  // ISBN ou id d'user_books à désactiver (déjà utilisés ailleurs).
  disabledIds?: Set<string>;
  // ids d'user_books à masquer entièrement de la liste.
  excludedIds?: Set<string>;
  // Rendu optionnel d'un badge sur chaque ligne (ex: "Fiche en cours").
  renderRight?: (ub: UserBook) => ReactNode;
  // Affichage si la biblio est vide. Par défaut : redirection scanner.
  emptyTitle?: string;
  emptyBody?: string;
  header?: ReactNode; // bloc custom au-dessus de la liste (ex: item coché)
};

export function BookPicker({
  title,
  subtitle,
  onPick,
  disabledIds,
  excludedIds,
  renderRight,
  emptyTitle = 'Bibliothèque vide',
  emptyBody = "Ajoute d'abord un livre à ta bibliothèque.",
  header,
}: BookPickerProps) {
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = excludedIds
      ? books.filter((b) => !excludedIds.has(b.id))
      : books;
    if (!q) return visible;
    return visible.filter(
      (b) =>
        b.book.title.toLowerCase().includes(q) ||
        b.book.authors.some((a) => a.toLowerCase().includes(q)),
    );
  }, [books, query, excludedIds]);

  if (books.length === 0) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper px-8" edges={['bottom']}>
        <Text className="font-display text-2xl text-ink">{emptyTitle}</Text>
        <Text className="mt-2 text-center text-ink-muted">{emptyBody}</Text>
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
            <Text className="font-display text-2xl text-ink">{title}</Text>
            {subtitle ? (
              <Text className="mt-1 text-sm text-ink-muted">{subtitle}</Text>
            ) : null}
          </Animated.View>
          {header}
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
                const disabled = disabledIds?.has(ub.id);
                return (
                  <Animated.View key={ub.id} entering={FadeIn.duration(220).delay(i * 20)}>
                    <Pressable
                      onPress={() => !disabled && onPick(ub)}
                      disabled={disabled}
                      style={{ opacity: disabled ? 0.4 : 1 }}
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
                      {renderRight ? renderRight(ub) : null}
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
