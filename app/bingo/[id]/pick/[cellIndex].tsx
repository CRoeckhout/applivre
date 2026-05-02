import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { READING_STATUS_META } from '@/lib/reading-status';
import { useBingos } from '@/store/bingo';
import { useBookshelf } from '@/store/bookshelf';
import type { BingoCompletion } from '@/types/bingo';
import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

const EMPTY_COMPLETIONS: BingoCompletion[] = [];

export default function BingoCellPicker() {
  const router = useRouter();
  const { id, cellIndex: cellIndexStr } = useLocalSearchParams<{
    id: string;
    cellIndex: string;
  }>();
  const cellIndex = parseInt(cellIndexStr, 10);

  const bingo = useBingos((s) => s.bingos.find((b) => b.id === id));
  const completions = useBingos((s) => s.completions[id]) ?? EMPTY_COMPLETIONS;
  const setCompletion = useBingos((s) => s.setCompletion);
  const removeCompletion = useBingos((s) => s.removeCompletion);
  const books = useBookshelf((s) => s.books);

  // Fallback explicite vers la grille parente si la pile de navigation a été
  // perdue (ex: deep link, route imbriquée [id]/pick — Expo Router ne
  // garantit pas toujours qu'`router.back()` ait une cible).
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(`/bingo/${id}`);
  }, [router, id]);

  const item = useMemo(
    () => bingo?.items.find((it) => it.position === cellIndex),
    [bingo, cellIndex],
  );

  const currentUserBookId = useMemo(
    () => completions.find((c) => c.cellIndex === cellIndex)?.userBookId,
    [completions, cellIndex],
  );

  const currentBook = useMemo(
    () => (currentUserBookId ? books.find((b) => b.id === currentUserBookId) : undefined),
    [books, currentUserBookId],
  );

  // Tous les user_book déjà utilisés sur cette grille, sauf celui de la case
  // courante (pour autoriser le "changer de livre" sur la même case).
  const disabledIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of completions) {
      if (c.cellIndex === cellIndex) continue;
      s.add(c.userBookId);
    }
    return s;
  }, [completions, cellIndex]);

  const excludedIds = useMemo(
    () => (currentUserBookId ? new Set([currentUserBookId]) : undefined),
    [currentUserBookId],
  );

  if (!bingo || Number.isNaN(cellIndex) || !item) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <Text className="text-ink-muted">Case introuvable.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={goBack} hitSlop={10} className="p-1 active:opacity-60">
              <MaterialIcons name="arrow-back-ios" size={20} color="#1f1a16" />
            </Pressable>
          ),
        }}
      />
      <BookPicker
        onPick={(ub) => {
          setCompletion(id, cellIndex, ub.id);
          goBack();
        }}
        disabledIds={disabledIds}
        excludedIds={excludedIds}
        renderRight={(ub) => (
          <View
            style={{ backgroundColor: READING_STATUS_META[ub.status].color }}
            className="rounded-full px-2 py-0.5">
            <Text className="text-[11px] font-sans-med text-paper">
              {READING_STATUS_META[ub.status].label}
            </Text>
          </View>
        )}
        header={
          <View className="mt-3 gap-3">
            {!currentBook && (
              <View
                style={{ backgroundColor: '#e5e1da' }}
                className="self-start rounded-full px-3 py-1">
                <Text className="text-sm font-sans-bold text-ink">
                  {item.label}
                </Text>
              </View>
            )}
            {currentBook && (
              <View className="rounded-2xl bg-paper-warm p-3">
                <View
                  style={{ backgroundColor: '#e5e1da' }}
                  className="self-start rounded-full px-3 py-1">
                  <Text className="text-sm font-sans-bold text-ink">
                    {item.label}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push(`/book/${currentBook.book.isbn}`)}
                  className="mt-2 flex-row items-center gap-3 active:opacity-80">
                  <BookCover
                    isbn={currentBook.book.isbn}
                    coverUrl={currentBook.book.coverUrl}
                    style={{ width: 44, height: 66, borderRadius: 6 }}
                  />
                  <View className="flex-1">
                    <Text numberOfLines={2} className="font-display text-base text-ink">
                      {currentBook.book.title}
                    </Text>
                    {currentBook.book.authors[0] ? (
                      <Text numberOfLines={1} className="text-sm text-ink-soft">
                        {currentBook.book.authors[0]}
                      </Text>
                    ) : null}
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#6b6259" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    removeCompletion(id, cellIndex);
                    goBack();
                  }}
                  className="mt-3 self-center rounded-full border border-red-500/40 bg-red-500/10 px-4 py-1.5 active:opacity-70">
                  <Text className="text-sm font-sans-med text-red-600">
                    Retirer le livre de la case
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        emptyBody="Ajoute d'abord un livre à ta bibliothèque pour le placer sur la grille."
      />
    </>
  );
}
