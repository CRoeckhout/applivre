import { BookCover } from '@/components/book-cover';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { displayGenres, primaryGenre } from '@/lib/genre';
import { useBookshelf } from '@/store/bookshelf';
import type { ReadingStatus, UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type SortKey = 'added' | 'title';

type SectionDef = {
  status: ReadingStatus;
  label: string;
};

const SECTIONS: SectionDef[] = [
  { status: 'wishlist', label: 'Wishlist' },
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

const STATUS_OPTIONS: { value: ReadingStatus; label: string }[] = [
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'to_read', label: 'À lire' },
  { value: 'reading', label: 'En cours' },
  { value: 'read', label: 'Lu' },
  { value: 'abandoned', label: 'Abandonné' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; favorite?: string }>();
  const books = useBookshelf((s) => s.books);
  const removeBook = useBookshelf((s) => s.removeBook);
  const updateStatus = useBookshelf((s) => s.updateStatus);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const [authorFilter, setAuthorFilter] = useState<string>(ALL);
  const [genreFilter, setGenreFilter] = useState<string>(ALL);
  const statusParam = (params.status as ReadingStatus | undefined) ?? null;
  const favoriteParam = params.favorite === '1';
  const [openPicker, setOpenPicker] = useState<'author' | 'genre' | null>(null);
  const debouncedQuery = useDebouncedValue(query, 150).toLowerCase().trim();

  // Sélection multiple + menu contextuel
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenuFor, setContextMenuFor] = useState<UserBook | null>(null);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onTilePress = useCallback(
    (ub: UserBook) => {
      if (selectionMode) {
        toggleSelected(ub.id);
      } else {
        router.push(`/book/${ub.book.isbn}`);
      }
    },
    [selectionMode, toggleSelected, router],
  );

  const onTileLongPress = useCallback(
    (ub: UserBook) => {
      if (selectionMode) {
        toggleSelected(ub.id);
      } else {
        setContextMenuFor(ub);
      }
    },
    [selectionMode, toggleSelected],
  );

  const onContextDelete = (ub: UserBook) => {
    setContextMenuFor(null);
    Alert.alert('Supprimer ce livre ?', `« ${ub.book.title} » sera retiré de ta bibliothèque.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => removeBook(ub.id),
      },
    ]);
  };

  const onContextSelect = (ub: UserBook) => {
    setContextMenuFor(null);
    setSelectionMode(true);
    setSelectedIds(new Set([ub.id]));
  };

  const onBulkDelete = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    Alert.alert(
      'Supprimer les livres sélectionnés ?',
      `${ids.length} livre${ids.length > 1 ? 's' : ''} retiré${ids.length > 1 ? 's' : ''} de ta bibliothèque.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            for (const id of ids) removeBook(id);
            exitSelection();
          },
        },
      ],
    );
  };

  const onBulkStatus = (status: ReadingStatus) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const label = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
    Alert.alert(
      'Changer le statut ?',
      `${ids.length} livre${ids.length > 1 ? 's' : ''} → ${label}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: () => {
            for (const id of ids) updateStatus(id, status);
            exitSelection();
          },
        },
      ],
    );
  };

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
      if (statusParam && b.status !== statusParam) return false;
      if (favoriteParam && !b.favorite) return false;
      return true;
    });
  }, [books, debouncedQuery, authorFilter, genreFilter, statusParam, favoriteParam]);

  const sections = useMemo(() => {
    const byStatus: Record<ReadingStatus, UserBook[]> = {
      wishlist: [],
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
      {selectionMode && (
        <SelectionBar count={selectedIds.size} onCancel={exitSelection} />
      )}
      <ScrollView
        contentContainerClassName={`px-6 pt-4 ${selectionMode ? 'pb-56' : 'pb-24'}`}
        keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(400)}>
          <SearchBar value={query} onChange={setQuery} />
        </Animated.View>

        {(statusParam || favoriteParam) && (
          <View className="mt-3 flex-row flex-wrap gap-2">
            {statusParam && (
              <FilterChip
                label={statusLabel(statusParam)}
                onClear={() => router.setParams({ status: undefined })}
              />
            )}
            {favoriteParam && (
              <FilterChip
                label="J'aime"
                onClear={() => router.setParams({ favorite: undefined })}
              />
            )}
          </View>
        )}

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
                onPressItem={onTilePress}
                onLongPressItem={onTileLongPress}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
              />
            );
          })
        )}
      </ScrollView>

      {!selectionMode && (
        <Pressable
          onPress={() => router.push('/scanner')}
          accessibilityLabel="Ajouter un livre"
          style={{
            position: 'absolute',
            right: 24,
            bottom: 24,
            width: 60,
            height: 60,
            borderRadius: 30,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 8,
            elevation: 4,
          }}
          className="items-center justify-center bg-accent active:opacity-80">
          <MaterialIcons name="add" size={32} color="white" />
        </Pressable>
      )}

      <BookContextMenuModal
        ub={contextMenuFor}
        onClose={() => setContextMenuFor(null)}
        onDelete={onContextDelete}
        onSelect={onContextSelect}
      />

      {selectionMode && (
        <SelectionActionBar
          disabled={selectedIds.size === 0}
          onPickStatus={onBulkStatus}
          onDelete={onBulkDelete}
        />
      )}

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

function statusLabel(s: ReadingStatus): string {
  switch (s) {
    case 'wishlist':
      return 'Wishlist';
    case 'to_read':
      return 'À lire';
    case 'reading':
      return 'En cours';
    case 'read':
      return 'Lu';
    case 'abandoned':
      return 'Abandonné';
  }
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <View className="flex-row items-center gap-2 rounded-full bg-accent-pale px-3 py-1.5">
      <Text className="text-sm text-accent-deep">{label}</Text>
      <Pressable onPress={onClear} hitSlop={8}>
        <MaterialIcons name="close" size={16} color="#9b5a38" />
      </Pressable>
    </View>
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
  onLongPressItem,
  selectionMode,
  selectedIds,
}: {
  label: string;
  items: UserBook[];
  onPressItem: (ub: UserBook) => void;
  onLongPressItem: (ub: UserBook) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
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
          <BookTile
            key={ub.id}
            book={ub}
            onPress={() => onPressItem(ub)}
            onLongPress={() => onLongPressItem(ub)}
            selected={selectedIds.has(ub.id)}
            selectionMode={selectionMode}
          />
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

function BookTile({
  book,
  onPress,
  onLongPress,
  selected,
  selectionMode,
}: {
  book: UserBook;
  onPress: () => void;
  onLongPress: () => void;
  selected: boolean;
  selectionMode: boolean;
}) {
  const genres = displayGenres(book);
  const primary = primaryGenre(book);
  const extra = genres.length - 1;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={{
        width: '47%',
        opacity: selectionMode && !selected ? 0.55 : 1,
      }}
      className="active:opacity-70">
      <View className="relative" style={{ overflow: 'visible' }}>
        <BookCover
          isbn={book.book.isbn}
          coverUrl={book.book.coverUrl}
          style={{ width: '100%', aspectRatio: 2 / 3, borderRadius: 10 }}
          placeholderText={book.book.title}
        />
        <View
          style={{ position: 'absolute', top: -6, left: -6 }}
          className="flex-row gap-1">
          {book.status === 'wishlist' && (
            <View
              style={{
                backgroundColor: '#d4a017',
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 4,
                elevation: 3,
              }}
              className="rounded-full p-1.5">
              <MaterialIcons name="bookmark" size={14} color="#fbf8f4" />
            </View>
          )}
          {book.favorite && (
            <View
              style={{
                backgroundColor: '#d4493e',
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 4,
                elevation: 3,
              }}
              className="rounded-full p-1.5">
              <MaterialIcons name="favorite" size={14} color="#fbf8f4" />
            </View>
          )}
        </View>
        {selectionMode && (
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
            className="h-6 w-6 items-center justify-center rounded-full">
            {selected && <MaterialIcons name="check" size={16} color="#fbf8f4" />}
          </View>
        )}
      </View>
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

function SelectionBar({ count, onCancel }: { count: number; onCancel: () => void }) {
  return (
    <View className="flex-row items-center justify-between border-b border-paper-shade bg-paper-warm px-4 py-3">
      <Pressable onPress={onCancel} hitSlop={8} className="p-1 active:opacity-60">
        <MaterialIcons name="close" size={22} color="#1f1a16" />
      </Pressable>
      <Text className="font-sans-med text-ink">
        {count} sélectionné{count > 1 ? 's' : ''}
      </Text>
      <View style={{ width: 30 }} />
    </View>
  );
}

const SELECTION_STATUS: {
  value: ReadingStatus;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}[] = [
  { value: 'wishlist', label: 'Wishlist', icon: 'bookmark-border', color: '#d4a017' },
  { value: 'to_read', label: 'À lire', icon: 'schedule', color: '#4a90c2' },
  { value: 'reading', label: 'En cours', icon: 'auto-stories', color: '#8e5dc8' },
  { value: 'read', label: 'Lu', icon: 'check-circle', color: '#5fa84d' },
  { value: 'abandoned', label: 'Abandonné', icon: 'cancel', color: '#1f1a16' },
];

function SelectionActionBar({
  disabled,
  onPickStatus,
  onDelete,
}: {
  disabled: boolean;
  onPickStatus: (s: ReadingStatus) => void;
  onDelete: () => void;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      className="px-3 pb-6">
      <Pressable
        onPress={onDelete}
        disabled={disabled}
        style={{
          opacity: disabled ? 0.35 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 6,
          elevation: 3,
        }}
        className="mb-3 flex-row items-center justify-center gap-2 rounded-full bg-white px-4 py-3 active:opacity-80">
        <MaterialIcons name="delete-outline" size={20} color="#b8503a" />
        <Text style={{ color: '#b8503a' }} className="font-sans-med">
          Supprimer
        </Text>
      </Pressable>
      <View className="flex-row items-stretch justify-between">
        {SELECTION_STATUS.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => onPickStatus(s.value)}
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
            className="mx-1 items-center justify-center rounded-full px-2 py-4 active:opacity-80">
            <MaterialIcons name={s.icon} size={22} color={s.color} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: s.color }}
              className="mt-1 text-[11px]">
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function BookContextMenuModal({
  ub,
  onClose,
  onDelete,
  onSelect,
}: {
  ub: UserBook | null;
  onClose: () => void;
  onDelete: (ub: UserBook) => void;
  onSelect: (ub: UserBook) => void;
}) {
  return (
    <Modal visible={!!ub} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-end bg-ink/50 px-4 pb-8">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-3xl bg-paper p-2">
          {ub && (
            <View className="px-4 pt-3 pb-2">
              <Text numberOfLines={2} className="font-display text-base text-ink">
                {ub.book.title}
              </Text>
            </View>
          )}
          <Pressable
            onPress={() => ub && onSelect(ub)}
            className="flex-row items-center gap-3 rounded-2xl px-4 py-3 active:bg-paper-warm">
            <MaterialIcons name="check-box-outline-blank" size={22} color="#1f1a16" />
            <Text className="text-ink">Sélectionner</Text>
          </Pressable>
          <Pressable
            onPress={() => ub && onDelete(ub)}
            className="flex-row items-center gap-3 rounded-2xl px-4 py-3 active:bg-paper-warm">
            <MaterialIcons name="delete-outline" size={22} color="#b8503a" />
            <Text style={{ color: '#b8503a' }}>Supprimer</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            className="mt-1 rounded-2xl px-4 py-3 active:bg-paper-warm">
            <Text className="text-center text-ink-muted">Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

