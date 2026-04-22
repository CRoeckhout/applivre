import { BookCover } from '@/components/book-cover';
import { useBookshelf } from '@/store/bookshelf';
import { useReadingSheets } from '@/store/reading-sheets';
import type { ReadingSheet, UserBook } from '@/types/book';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type Entry = { sheet: ReadingSheet; userBook: UserBook };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} jours`;
  if (d < 30) return `il y a ${Math.floor(d / 7)} sem.`;
  if (d < 365) return `il y a ${Math.floor(d / 30)} mois`;
  return `il y a ${Math.floor(d / 365)} an${d >= 730 ? 's' : ''}`;
}

export default function SheetsScreen() {
  const router = useRouter();
  const sheets = useReadingSheets((s) => s.sheets);
  const books = useBookshelf((s) => s.books);

  const entries = useMemo<Entry[]>(() => {
    const bookById = new Map(books.map((b) => [b.id, b]));
    return Object.values(sheets)
      .map((sheet) => ({ sheet, userBook: bookById.get(sheet.userBookId) }))
      .filter((e): e is Entry => !!e.userBook)
      .sort(
        (a, b) =>
          new Date(b.sheet.updatedAt).getTime() - new Date(a.sheet.updatedAt).getTime(),
      );
  }, [sheets, books]);

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-24">
        <Animated.View entering={FadeInDown.duration(500)} className="flex-row items-end justify-between">
          <View className="flex-1 pr-3">
            <Text className="font-display text-4xl text-ink">Mes fiches</Text>
            <Text className="mt-1 text-base text-ink-muted">
              {entries.length === 0
                ? 'Note ce que tu penses des livres que tu lis.'
                : `${entries.length} fiche${entries.length > 1 ? 's' : ''} en cours`}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/sheet/new')}
            accessibilityLabel="Nouvelle fiche"
            className="h-12 w-12 items-center justify-center rounded-full bg-accent active:opacity-80">
            <Text className="text-2xl text-paper">+</Text>
          </Pressable>
        </Animated.View>

        {entries.length === 0 ? (
          <EmptyState onCreate={() => router.push('/sheet/new')} />
        ) : (
          <View className="mt-8 gap-3">
            {entries.map((e, i) => (
              <Animated.View key={e.sheet.userBookId} entering={FadeIn.duration(300).delay(i * 40)}>
                <SheetRow entry={e} onPress={() => router.push(`/sheet/${e.userBook.book.isbn}`)} />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(500).delay(150)}
      className="mt-10 items-center rounded-3xl bg-paper-warm p-8">
      <Text className="text-center font-display text-2xl text-ink">Aucune fiche</Text>
      <Text className="mt-2 text-center text-ink-muted">
        Les fiches de lecture te permettent de noter tes impressions, tes personnages favoris,
        ton avis sur l&apos;histoire.
      </Text>
      <Pressable
        onPress={onCreate}
        className="mt-6 rounded-full bg-accent px-6 py-3 active:opacity-80">
        <Text className="font-sans-med text-paper">+ Nouvelle fiche</Text>
      </Pressable>
    </Animated.View>
  );
}

function SheetRow({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const { sheet, userBook } = entry;

  // Preview = première section avec contenu ou rating, sinon "pas encore rempli"
  const preview = sheet.sections.find((s) => s.body.trim() || s.rating);
  const nonEmpty = sheet.sections.filter((s) => s.body.trim() || s.rating).length;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row gap-3 rounded-2xl bg-paper-warm p-3 active:bg-paper-shade">
      <BookCover
        isbn={userBook.book.isbn}
        coverUrl={userBook.book.coverUrl}
        style={{ width: 56, height: 84, borderRadius: 6 }}
      />
      <View className="flex-1">
        <Text numberOfLines={2} className="font-display text-base text-ink">
          {userBook.book.title}
        </Text>
        {userBook.book.authors[0] ? (
          <Text numberOfLines={1} className="text-sm text-ink-soft">
            {userBook.book.authors[0]}
          </Text>
        ) : null}

        <View className="mt-2">
          {preview ? (
            <>
              <Text className="text-xs uppercase tracking-wider text-ink-muted">
                {preview.title || 'Sans titre'}
              </Text>
              {preview.body ? (
                <Text numberOfLines={2} className="mt-0.5 text-sm text-ink-soft">
                  {preview.body}
                </Text>
              ) : null}
            </>
          ) : (
            <Text className="text-sm italic text-ink-muted">
              {sheet.sections.length} catégorie{sheet.sections.length > 1 ? 's' : ''}, pas encore
              remplie{sheet.sections.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>

        <View className="mt-2 flex-row items-center gap-3">
          <Text className="text-xs text-ink-muted">
            {sheet.sections.length} section{sheet.sections.length > 1 ? 's' : ''}
          </Text>
          {nonEmpty > 0 && nonEmpty < sheet.sections.length && (
            <Text className="text-xs text-ink-muted">· {nonEmpty} remplie{nonEmpty > 1 ? 's' : ''}</Text>
          )}
          <Text className="ml-auto text-xs text-ink-muted">{timeAgo(sheet.updatedAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}
