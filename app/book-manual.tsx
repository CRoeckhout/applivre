import { newId } from '@/lib/id';
import { useBookshelf } from '@/store/bookshelf';
import type { Book, UserBook } from '@/types/book';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ManualEntryScreen() {
  const { isbn: prefilledIsbn, title: prefilledTitle } = useLocalSearchParams<{
    isbn?: string;
    title?: string;
  }>();
  const router = useRouter();
  const addBook = useBookshelf((s) => s.addBook);
  const books = useBookshelf((s) => s.books);

  const [title, setTitle] = useState(prefilledTitle ?? '');
  const [authors, setAuthors] = useState('');
  const [pages, setPages] = useState('');
  const [year, setYear] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [isbn, setIsbn] = useState(prefilledIsbn ?? '');

  const canSave = title.trim().length > 0;

  const onSave = () => {
    if (!canSave) return;

    const cleanIsbn = isbn.trim();
    if (cleanIsbn) {
      const existing = books.find((b) => b.book.isbn === cleanIsbn);
      if (existing) {
        router.replace(`/book/${existing.book.isbn}`);
        return;
      }
    }

    const finalIsbn = cleanIsbn || `manual-${newId()}`;
    const pagesNum = parseInt(pages.trim(), 10);

    const book: Book = {
      isbn: finalIsbn,
      title: title.trim(),
      authors: authors
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      pages: Number.isFinite(pagesNum) && pagesNum > 0 ? pagesNum : undefined,
      publishedAt: year.trim() || undefined,
      coverUrl: coverUrl.trim() || undefined,
      source: 'manual',
    };

    const userBook: UserBook = {
      id: newId(),
      userId: 'local',
      book,
      status: 'to_read',
      favorite: false,
    };

    addBook(userBook);
    router.replace(`/book/${finalIsbn}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerClassName="px-6 pt-4 pb-32"
          keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text className="font-display text-3xl text-ink">Saisie manuelle</Text>
            <Text className="mt-1 text-sm text-ink-muted">
              Pour les livres introuvables : auto-édition, zines, vieilles éditions…
            </Text>
          </Animated.View>

          <View className="mt-8 gap-5">
            <Field
              label="Titre"
              required
              value={title}
              onChangeText={setTitle}
              placeholder="Le titre du livre"
            />
            <Field
              label="Auteur·e·s"
              value={authors}
              onChangeText={setAuthors}
              placeholder="Séparer par virgules"
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field
                  label="Nombre de pages"
                  value={pages}
                  onChangeText={setPages}
                  placeholder="ex: 250"
                  keyboardType="number-pad"
                />
              </View>
              <View className="flex-1">
                <Field
                  label="Année"
                  value={year}
                  onChangeText={setYear}
                  placeholder="ex: 2023"
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Field
              label="URL de couverture"
              value={coverUrl}
              onChangeText={setCoverUrl}
              placeholder="https://…"
              autoCapitalize="none"
              keyboardType="url"
            />
            <Field
              label="ISBN (si disponible)"
              value={isbn}
              onChangeText={setIsbn}
              placeholder="978…"
              autoCapitalize="none"
            />
          </View>

          <Pressable
            disabled={!canSave}
            onPress={onSave}
            className={`mt-10 rounded-full py-3 ${
              canSave ? 'bg-accent active:opacity-80' : 'bg-paper-shade'
            }`}>
            <Text
              className={`text-center font-sans-med ${canSave ? 'text-paper' : 'text-ink-muted'}`}>
              Ajouter à ma bibliothèque
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()} className="mt-3 py-3 active:opacity-70">
            <Text className="text-center text-sm text-ink-muted">Annuler</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  keyboardType,
  autoCapitalize,
}: FieldProps) {
  return (
    <View>
      <Text className="mb-1 text-xs uppercase tracking-wider text-ink-muted">
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b6259"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        className="rounded-2xl bg-paper-warm px-4 py-3 text-base text-ink"
      />
    </View>
  );
}
