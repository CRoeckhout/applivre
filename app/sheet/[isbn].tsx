import { BookCover } from '@/components/book-cover';
import { AddRatingButtons, RatingIcon, RatingRow } from '@/components/rating-row';
import { useBookshelf } from '@/store/bookshelf';
import {
  SUGGESTED_CATEGORIES,
  useReadingSheets,
  type SuggestedCategory,
} from '@/store/reading-sheets';
import type { RatingIconKind, SheetSection } from '@/types/book';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
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

export default function SheetScreen() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const userBook = books.find((b) => b.book.isbn === isbn);

  const sheets = useReadingSheets((s) => s.sheets);
  const addSection = useReadingSheets((s) => s.addSection);

  const sheet = userBook ? sheets[userBook.id] : undefined;
  const sections = sheet?.sections ?? [];

  const unusedSuggestions = useMemo(() => {
    const used = new Set(sections.map((s) => s.title.toLowerCase()));
    return SUGGESTED_CATEGORIES.filter((s) => !used.has(s.title.toLowerCase()));
  }, [sections]);

  if (!userBook) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper px-8">
        <Text className="font-display text-2xl text-ink">Livre introuvable</Text>
        <Text className="mt-2 text-center text-ink-muted">
          Ajoute d&apos;abord le livre à ta bibliothèque pour créer une fiche.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80">
          <Text className="font-sans-med text-paper">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerClassName="px-6 pt-4 pb-32"
          keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(400)} className="flex-row items-center gap-3">
            <BookCover
              isbn={userBook.book.isbn}
              coverUrl={userBook.book.coverUrl}
              style={{ width: 48, height: 72, borderRadius: 6 }}
            />
            <View className="flex-1">
              <Text className="text-xs uppercase tracking-wider text-ink-muted">Fiche de lecture</Text>
              <Text numberOfLines={2} className="font-display text-xl text-ink">
                {userBook.book.title}
              </Text>
            </View>
          </Animated.View>

          {sections.length === 0 ? (
            <EmptyState
              onAdd={(c) => addSection(userBook.id, c.title, c.icon)}
              onAddCustom={() => addSection(userBook.id, '')}
              suggestions={unusedSuggestions}
            />
          ) : (
            <View className="mt-8 gap-4">
              {sections.map((section, i) => (
                <Animated.View
                  key={section.id}
                  entering={FadeIn.duration(300).delay(i * 40)}>
                  <SectionEditor userBookId={userBook.id} section={section} />
                </Animated.View>
              ))}
            </View>
          )}

          {sections.length > 0 && unusedSuggestions.length > 0 && (
            <View className="mt-8">
              <Text className="mb-3 text-sm text-ink-muted">Ajouter une catégorie</Text>
              <View className="flex-row flex-wrap gap-2">
                {unusedSuggestions.map((c) => (
                  <SuggestionPill
                    key={c.title}
                    category={c}
                    onPress={() => addSection(userBook.id, c.title, c.icon)}
                  />
                ))}
              </View>
            </View>
          )}

          {sections.length > 0 && (
            <Pressable
              onPress={() => addSection(userBook.id, '')}
              className="mt-6 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">+ Section personnalisée</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EmptyState({
  onAdd,
  onAddCustom,
  suggestions,
}: {
  onAdd: (c: SuggestedCategory) => void;
  onAddCustom: () => void;
  suggestions: SuggestedCategory[];
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(500).delay(100)}
      className="mt-10 rounded-3xl bg-paper-warm p-6">
      <Text className="font-display text-2xl text-ink">Crée ta fiche</Text>
      <Text className="mt-2 text-ink-muted">
        Note tes impressions sur ce livre. Ajoute les catégories qui t&apos;inspirent, crée les tiennes.
      </Text>
      <View className="mt-5 flex-row flex-wrap gap-2">
        {suggestions.map((c) => (
          <SuggestionPill
            key={c.title}
            category={c}
            onPress={() => onAdd(c)}
            bg="bg-paper"
          />
        ))}
      </View>
      <Pressable
        onPress={onAddCustom}
        className="mt-4 rounded-full bg-accent px-6 py-3 active:opacity-80">
        <Text className="text-center font-sans-med text-paper">+ Section personnalisée</Text>
      </Pressable>
    </Animated.View>
  );
}

function SuggestionPill({
  category,
  onPress,
  bg = 'bg-paper-warm',
}: {
  category: SuggestedCategory;
  onPress: () => void;
  bg?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full ${bg} px-4 py-2 active:bg-paper-shade`}>
      <Text className="text-sm text-ink">+ {category.title}</Text>
      {category.icon && <RatingIcon kind={category.icon} filled size={14} />}
    </Pressable>
  );
}

function SectionEditor({
  userBookId,
  section,
}: {
  userBookId: string;
  section: SheetSection;
}) {
  const updateTitle = useReadingSheets((s) => s.updateSectionTitle);
  const updateBody = useReadingSheets((s) => s.updateSectionBody);
  const setRating = useReadingSheets((s) => s.setSectionRating);
  const removeSection = useReadingSheets((s) => s.removeSection);

  const handleAddRating = (icon: RatingIconKind) =>
    setRating(userBookId, section.id, { value: 0, icon });
  const handleChangeRating = (value: number) => {
    if (!section.rating) return;
    setRating(userBookId, section.id, { ...section.rating, value });
  };

  return (
    <View className="rounded-2xl bg-paper-warm p-4">
      <View className="flex-row items-start gap-2">
        <TextInput
          value={section.title}
          onChangeText={(v) => updateTitle(userBookId, section.id, v)}
          placeholder="Titre de la catégorie"
          placeholderTextColor="#6b6259"
          className="flex-1 font-display text-lg text-ink"
        />
        <Pressable
          onPress={() => removeSection(userBookId, section.id)}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-paper-shade">
          <Text className="text-xl text-ink-muted">×</Text>
        </Pressable>
      </View>

      {section.rating ? (
        <View className="mt-2">
          <RatingRow
            kind={section.rating.icon}
            value={section.rating.value}
            onChange={handleChangeRating}
            onRemove={() => setRating(userBookId, section.id, null)}
          />
        </View>
      ) : (
        <View className="mt-2">
          <AddRatingButtons onAdd={handleAddRating} />
        </View>
      )}

      <TextInput
        value={section.body}
        onChangeText={(v) => updateBody(userBookId, section.id, v)}
        placeholder="Écris ici ton avis, tes pensées…"
        placeholderTextColor="#6b6259"
        multiline
        textAlignVertical="top"
        className="mt-3 min-h-24 text-base leading-6 text-ink-soft"
      />
    </View>
  );
}
