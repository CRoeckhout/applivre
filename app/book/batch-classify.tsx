import { usePaperScreenClass } from '@/components/app-fond-background';
import { BookCover } from '@/components/book-cover';
import { newId } from '@/lib/id';
import { useBookshelf } from '@/store/bookshelf';
import { useScanBatch } from '@/store/scan-batch';
import type { Book, ReadingStatus, UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUS_META: Record<
  ReadingStatus,
  { label: string; icon: keyof typeof MaterialIcons.glyphMap; color: string }
> = {
  wishlist: { label: 'Wishlist', icon: 'bookmark-border', color: '#d4a017' },
  to_read: { label: 'À lire', icon: 'schedule', color: '#4a90c2' },
  reading: { label: 'En cours', icon: 'auto-stories', color: '#8e5dc8' },
  paused: { label: 'En pause', icon: 'pause-circle-filled', color: '#8e5dc8' },
  read: { label: 'Lu', icon: 'check-circle', color: '#5fa84d' },
  abandoned: { label: 'Abandonné', icon: 'cancel', color: '#1f1a16' },
};

// Statuts proposés au classement (on exclut "En pause", qui suppose une page
// de reprise saisie sur la fiche du livre).
const SELECTABLE: ReadingStatus[] = ['wishlist', 'to_read', 'reading', 'read', 'abandoned'];

const DEFAULT_STATUS: ReadingStatus = 'to_read';

export default function BatchClassifyScreen() {
  const router = useRouter();
  const paperScreen = usePaperScreenClass();
  const items = useScanBatch((s) => s.items);
  const clear = useScanBatch((s) => s.clear);
  const books = useBookshelf((s) => s.books);
  const addBook = useBookshelf((s) => s.addBook);
  const updateStatus = useBookshelf((s) => s.updateStatus);

  // Map isbn → UserBook déjà en biblio (le cas échéant).
  const existingByIsbn = useMemo(() => {
    const map: Record<string, UserBook> = {};
    for (const b of books) map[b.book.isbn] = b;
    return map;
  }, [books]);

  // Sélection : par défaut tous les NOUVEAUX livres. Les livres déjà en biblio
  // démarrent désélectionnés → un changement de statut global ne les touche pas.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const it of items) if (!existingByIsbn[it.isbn]) set.add(it.isbn);
    return set;
  });
  // Statut assigné. Pré-rempli pour les nouveaux livres ; vide pour les
  // existants (on garde leur statut actuel tant qu'on n'y touche pas).
  const [statusByIsbn, setStatusByIsbn] = useState<Record<string, ReadingStatus>>(() => {
    const map: Record<string, ReadingStatus> = {};
    for (const it of items) if (!existingByIsbn[it.isbn]) map[it.isbn] = DEFAULT_STATUS;
    return map;
  });

  // Pile vidée (ex: hot reload) → on rebrousse chemin.
  useEffect(() => {
    if (items.length === 0) router.back();
  }, [items.length, router]);

  const toggleSelected = (isbn: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(isbn)) next.delete(isbn);
      else next.add(isbn);
      return next;
    });
  };

  const applyStatus = (status: ReadingStatus) => {
    if (selected.size === 0) return;
    setStatusByIsbn((prev) => {
      const next = { ...prev };
      for (const isbn of selected) next[isbn] = status;
      return next;
    });
  };

  const changeCount = Object.keys(statusByIsbn).length;

  const onFinish = () => {
    for (const it of items) {
      const status = statusByIsbn[it.isbn];
      if (!status) continue; // aucun changement demandé pour ce livre
      const existing = existingByIsbn[it.isbn];
      if (existing) {
        if (existing.status !== status) updateStatus(existing.id, status);
      } else {
        addBook(buildUserBook(it, status));
      }
    }
    router.replace('/library');
    clear();
  };

  return (
    <SafeAreaView className={`flex-1 ${paperScreen}`} edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-1 active:opacity-60">
          <MaterialIcons name="close" size={24} color="#1f1a16" />
        </Pressable>
        <Text className="font-display text-lg text-ink">Livres à classer</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerClassName="px-6 pt-2 pb-72">
        <Text className="text-sm text-ink-muted">
          Sélectionne les livres puis choisis un statut. Touche un statut pour l&apos;appliquer à la sélection.
        </Text>
        <View className="mt-5 flex-row flex-wrap" style={{ gap: 16 }}>
          {items.map((it) => {
            const existing = existingByIsbn[it.isbn];
            const isSelected = selected.has(it.isbn);
            const shownStatus = statusByIsbn[it.isbn] ?? existing?.status;
            return (
              <ClassifyTile
                key={it.isbn}
                book={it}
                existing={!!existing}
                existingStatus={existing?.status}
                shownStatus={shownStatus}
                changed={!!statusByIsbn[it.isbn]}
                selected={isSelected}
                onToggle={() => toggleSelected(it.isbn)}
              />
            );
          })}
        </View>
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        className="bg-paper px-3 pb-8 pt-3"
      >
        <View className="flex-row items-stretch justify-between">
          {SELECTABLE.map((value) => {
            const meta = STATUS_META[value];
            const disabled = selected.size === 0;
            return (
              <Pressable
                key={value}
                onPress={() => applyStatus(value)}
                disabled={disabled}
                style={{
                  flex: 1,
                  opacity: disabled ? 0.35 : 1,
                  backgroundColor: '#ffffff',
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowOffset: { width: 0, height: 2 },
                  shadowRadius: 6,
                  elevation: 3,
                }}
                className="mx-1 items-center justify-center rounded-full px-2 py-4 active:opacity-80"
              >
                <MaterialIcons name={meta.icon} size={22} color={meta.color} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: meta.color }}
                  className="mt-1 text-[11px]"
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={onFinish}
          disabled={changeCount === 0}
          style={{ opacity: changeCount === 0 ? 0.4 : 1 }}
          className="mt-3 items-center rounded-full bg-ink py-4 active:opacity-80"
        >
          <Text className="font-sans-med text-paper">Terminer</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function buildUserBook(book: Book, status: ReadingStatus): UserBook {
  const now = new Date().toISOString();
  return {
    id: newId(),
    userId: 'local',
    book,
    status,
    favorite: false,
    startedAt: status === 'reading' ? now : undefined,
    finishedAt: status === 'read' ? now : undefined,
  };
}

function ClassifyTile({
  book,
  existing,
  existingStatus,
  shownStatus,
  changed,
  selected,
  onToggle,
}: {
  book: Book;
  existing: boolean;
  existingStatus?: ReadingStatus;
  shownStatus?: ReadingStatus;
  changed: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = shownStatus ? STATUS_META[shownStatus] : null;
  return (
    <Pressable onPress={onToggle} style={{ width: '47%' }} className="active:opacity-70">
      <View className="relative" style={{ overflow: 'visible', opacity: existing && !selected ? 0.5 : 1 }}>
        <BookCover
          isbn={book.isbn}
          coverUrl={book.coverUrl}
          style={{ width: '100%', aspectRatio: 2 / 3, borderRadius: 10 }}
          placeholderText={book.title}
        />
        {meta && (
          <View
            style={{ position: 'absolute', top: -6, left: -6 }}
            className="flex-row gap-1"
          >
            <View
              style={{
                backgroundColor: meta.color,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 4,
                elevation: 3,
              }}
              className="rounded-full p-1.5"
            >
              <MaterialIcons name={meta.icon} size={14} color="#fbf8f4" />
            </View>
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            backgroundColor: selected ? '#9b5a38' : '#ffffff',
            borderWidth: selected ? 0 : 1.5,
            borderColor: '#9a8f82',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowOffset: { width: 0, height: 2 },
            shadowRadius: 4,
            elevation: 3,
          }}
          className="h-6 w-6 items-center justify-center rounded-full"
        >
          {selected && <MaterialIcons name="check" size={16} color="#fbf8f4" />}
        </View>
      </View>
      <Text numberOfLines={2} className="mt-2 font-display text-sm text-ink">
        {book.title}
      </Text>
      {book.authors[0] ? (
        <Text numberOfLines={1} className="text-xs text-ink-muted">
          {book.authors[0]}
        </Text>
      ) : null}
      {existing && !changed && existingStatus ? (
        <Text numberOfLines={1} className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-muted">
          Déjà en biblio · {STATUS_META[existingStatus].label}
        </Text>
      ) : null}
    </Pressable>
  );
}
