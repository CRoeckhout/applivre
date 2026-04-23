import { BookCover } from '@/components/book-cover';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { displayGenres, primaryGenre } from '@/lib/genre';
import { useBookshelf } from '@/store/bookshelf';
import type { ReadingStatus, UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type SortKey = 'added' | 'title';

type SectionDef = {
  status: ReadingStatus;
  label: string;
};

const SECTIONS: SectionDef[] = [
  { status: 'reading', label: 'En cours' },
  { status: 'to_read', label: 'À lire' },
  { status: 'read', label: 'Terminés' },
  { status: 'abandoned', label: 'Abandonnés' },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'added', label: 'Date ajout' },
  { value: 'title', label: 'Titre' },
];

const ALL = '__all__';

function sortKey(ub: UserBook, key: SortKey): string | number {
  switch (key) {
    case 'title':
      return ub.book.title.toLocaleLowerCase('fr');
    case 'added': {
      const t = ub.addedAt ? Date.parse(ub.addedAt) : 0;
      return -t;
    }
  }
}

function matchesQuery(ub: UserBook, q: string): boolean {
  if (!q) return true;
  const hay =
    ub.book.title.toLowerCase() +
    ' ' +
    ub.book.authors.join(' ').toLowerCase() +
    ' ' +
    displayGenres(ub).join(' ').toLowerCase();
  return hay.includes(q);
}

function hasGenre(ub: UserBook, genre: string): boolean {
  const key = genre.toLocaleLowerCase('fr');
  return displayGenres(ub).some((g) => g.toLocaleLowerCase('fr') === key);
}

export default function LibraryScreen() {
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const [authorFilter, setAuthorFilter] = useState<string>(ALL);
  const [genreFilter, setGenreFilter] = useState<string>(ALL);
  const [openPicker, setOpenPicker] = useState<'author' | 'genre' | null>(null);
  const debouncedQuery = useDebouncedValue(query, 150).toLowerCase().trim();

  const collator = useMemo(() => new Intl.Collator('fr', { sensitivity: 'base' }), []);

  const authors = useMemo(() => {
    const set = new Set<string>();
    for (const b of books) {
      for (const a of b.book.authors) {
        const t = a.trim();
        if (t) set.add(t);
      }
    }
    return [...set].sort(collator.compare);
  }, [books, collator]);

  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const b of books) {
      for (const g of displayGenres(b)) set.add(g);
    }
    return [...set].sort(collator.compare);
  }, [books, collator]);

  const filtered = useMemo(() => {
    return books.filter((b) => {
      if (!matchesQuery(b, debouncedQuery)) return false;
      if (authorFilter !== ALL && !b.book.authors.includes(authorFilter)) return false;
      if (genreFilter !== ALL && !hasGenre(b, genreFilter)) return false;
      return true;
    });
  }, [books, debouncedQuery, authorFilter, genreFilter]);

  const sections = useMemo(() => {
    const byStatus: Record<ReadingStatus, UserBook[]> = {
      reading: [],
      to_read: [],
      read: [],
      abandoned: [],
    };
    for (const b of filtered) byStatus[b.status].push(b);
    for (const s of Object.values(byStatus)) {
      s.sort((a, b) => {
        const ka = sortKey(a, sort);
        const kb = sortKey(b, sort);
        if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
        return collator.compare(String(ka), String(kb));
      });
    }
    return byStatus;
  }, [filtered, sort, collator]);

  const totalCount = books.length;
  const filteredCount = filtered.length;

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-24" keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(400)}>
          <SearchBar value={query} onChange={setQuery} />
        </Animated.View>

        <View className="mt-4 flex-row gap-2">
          <FilterSelect
            icon="person"
            label="Auteur"
            value={authorFilter === ALL ? null : authorFilter}
            onPress={() => setOpenPicker('author')}
          />
          <FilterSelect
            icon="local-offer"
            label="Genre"
            value={genreFilter === ALL ? null : genreFilter}
            onPress={() => setOpenPicker('genre')}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="mt-3 gap-2 pb-2">
          <Text className="self-center text-xs uppercase tracking-wider text-ink-muted">
            Tri
          </Text>
          {SORTS.map((s) => {
            const active = sort === s.value;
            return (
              <Pressable
                key={s.value}
                onPress={() => setSort(s.value)}
                className={`rounded-full px-4 py-2 ${active ? 'bg-ink' : 'bg-paper-warm'}`}>
                <Text className={active ? 'text-paper' : 'text-ink'}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {totalCount === 0 ? (
          <EmptyState onAdd={() => router.push('/scanner')} />
        ) : filteredCount === 0 ? (
          <View className="mt-10 items-center rounded-2xl bg-paper-warm p-6">
            <Text className="text-center text-ink-muted">Aucun livre ne correspond.</Text>
          </View>
        ) : (
          SECTIONS.map((sec) => {
            const items = sections[sec.status];
            if (items.length === 0) return null;
            return (
              <StatusSection
                key={sec.status}
                label={sec.label}
                items={items}
                onPressItem={(ub) => router.push(`/book/${ub.book.isbn}`)}
              />
            );
          })
        )}
      </ScrollView>

      <PickerModal
        open={openPicker === 'author'}
        title="Filtrer par auteur"
        options={authors}
        selected={authorFilter}
        onSelect={(v) => {
          setAuthorFilter(v);
          setOpenPicker(null);
        }}
        onClose={() => setOpenPicker(null)}
      />
      <PickerModal
        open={openPicker === 'genre'}
        title="Filtrer par genre"
        options={genres}
        selected={genreFilter}
        onSelect={(v) => {
          setGenreFilter(v);
          setOpenPicker(null);
        }}
        onClose={() => setOpenPicker(null)}
      />
    </SafeAreaView>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-paper-warm px-4 py-3">
      <MaterialIcons name="search" size={20} color="#6b6259" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Rechercher un livre, auteur, genre…"
        placeholderTextColor="rgb(107 98 89)"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        className="flex-1 text-base text-ink"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <MaterialIcons name="close" size={18} color="#6b6259" />
        </Pressable>
      )}
    </View>
  );
}

function FilterSelect({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string | null;
  onPress: () => void;
}) {
  const active = value !== null;
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row items-center gap-2 rounded-2xl px-3 py-2.5 ${
        active ? 'bg-accent' : 'bg-paper-warm active:bg-paper-shade'
      }`}>
      <MaterialIcons name={icon} size={16} color={active ? '#fbf8f4' : '#6b6259'} />
      <View className="flex-1">
        <Text
          className={`text-[10px] uppercase tracking-wider ${
            active ? 'text-paper/80' : 'text-ink-muted'
          }`}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          className={`text-sm ${active ? 'font-sans-med text-paper' : 'text-ink'}`}>
          {value ?? 'Tous'}
        </Text>
      </View>
      <MaterialIcons
        name="expand-more"
        size={18}
        color={active ? '#fbf8f4' : '#6b6259'}
      />
    </Pressable>
  );
}

function PickerModal({
  open,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/60 px-6" style={{ justifyContent: 'center' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-3xl bg-paper p-5"
          style={{ maxHeight: '80%' }}>
          <Text className="font-display text-xl text-ink">{title}</Text>
          <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
            <PickerRow
              label="Tous"
              active={selected === ALL}
              onPress={() => onSelect(ALL)}
            />
            {options.length === 0 ? (
              <Text className="mt-4 text-center text-sm italic text-ink-muted">
                Aucune valeur disponible.
              </Text>
            ) : (
              options.map((opt) => (
                <PickerRow
                  key={opt}
                  label={opt}
                  active={selected === opt}
                  onPress={() => onSelect(opt)}
                />
              ))
            )}
          </ScrollView>
          <Pressable
            onPress={onClose}
            className="mt-4 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
            <Text className="text-center text-ink-muted">Fermer</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PickerRow({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mt-1 flex-row items-center justify-between rounded-xl px-4 py-3 ${
        active ? 'bg-accent-pale' : 'active:bg-paper-warm'
      }`}>
      <Text className={`flex-1 text-base ${active ? 'font-sans-med text-ink' : 'text-ink'}`}>
        {label}
      </Text>
      {active && <MaterialIcons name="check" size={20} color="#9b5a38" />}
    </Pressable>
  );
}

function StatusSection({
  label,
  items,
  onPressItem,
}: {
  label: string;
  items: UserBook[];
  onPressItem: (ub: UserBook) => void;
}) {
  return (
    <View className="mt-6">
      <View className="flex-row items-baseline gap-2">
        <Text className="font-display text-xl text-ink">{label}</Text>
        <Text className="text-sm text-ink-muted">
          {items.length} livre{items.length > 1 ? 's' : ''}
        </Text>
      </View>
      <View className="mt-3 flex-row flex-wrap" style={{ gap: 16 }}>
        {items.map((ub) => (
          <BookTile key={ub.id} book={ub} onPress={() => onPressItem(ub)} />
        ))}
      </View>
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
  const genres = displayGenres(book);
  const primary = primaryGenre(book);
  const extra = genres.length - 1;
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
      {primary ? (
        <Text numberOfLines={1} className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-muted">
          {primary}
          {extra > 0 ? ` +${extra}` : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}
