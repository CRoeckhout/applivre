import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { useBingos } from '@/store/bingo';
import { useBookshelf } from '@/store/bookshelf';
import type { BingoCompletion } from '@/types/bingo';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
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
    <BookPicker
      title="Choisir un livre"
      subtitle={`Pour la case « ${item.label} »`}
      onPick={(ub) => {
        setCompletion(id, cellIndex, ub.id);
        router.back();
      }}
      disabledIds={disabledIds}
      excludedIds={excludedIds}
      header={
        <View className="mt-4 gap-3">
          <View className="rounded-2xl bg-accent-pale p-3">
            <Text className="text-xs uppercase tracking-wider text-accent-deep">
              Case sélectionnée
            </Text>
            <Text className="mt-1 font-display text-lg text-ink">{item.label}</Text>
          </View>
          {currentBook && (
            <View className="rounded-2xl bg-paper-warm p-3">
              <Text className="text-xs uppercase tracking-wider text-ink-muted">
                Livre actuel
              </Text>
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
                  router.back();
                }}
                className="mt-3 self-start rounded-full border border-ink-muted/30 px-3 py-1 active:opacity-70">
                <Text className="text-sm text-ink-muted">Retirer le livre de la case</Text>
              </Pressable>
            </View>
          )}
        </View>
      }
      emptyBody="Ajoute d'abord un livre à ta bibliothèque pour le placer sur la grille."
    />
  );
}
