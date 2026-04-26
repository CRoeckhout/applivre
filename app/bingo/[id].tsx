import { BingoGrid } from '@/components/bingo-grid';
import { BookCover } from '@/components/book-cover';
import { useKeyboardOffset } from '@/hooks/use-keyboard-offset';
import { BINGO_PRESETS } from '@/lib/bingo-presets';
import { completedLines, hasAnyWin } from '@/lib/bingo-win';
import { newId } from '@/lib/id';
import { useBadgeToasts } from '@/store/badge-toasts';
import { useBingos, isBingoLocked } from '@/store/bingo';
import { useBookshelf } from '@/store/bookshelf';
import type { BingoCompletion, BingoItem } from '@/types/bingo';
import { BINGO_CELLS } from '@/types/bingo';

const EMPTY_COMPLETIONS: BingoCompletion[] = [];
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { UserBook } from '@/types/book';
import { SafeAreaView } from 'react-native-safe-area-context';

type Selected =
  | { kind: 'pill'; id: string }
  | { kind: 'cell'; index: number }
  | null;

export default function BingoScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const router = useRouter();
  const forceEdit = edit === '1';

  const bingo = useBingos((s) => s.bingos.find((b) => b.id === id));
  const completions = useBingos((s) => s.completions[id]) ?? EMPTY_COMPLETIONS;
  const pills = useBingos((s) => s.pills);

  const updateBingoItems = useBingos((s) => s.updateBingoItems);
  const updateBingoTitle = useBingos((s) => s.updateBingoTitle);
  const markBingoSaved = useBingos((s) => s.markBingoSaved);
  const archiveBingo = useBingos((s) => s.archiveBingo);
  const deleteBingo = useBingos((s) => s.deleteBingo);
  const addPill = useBingos((s) => s.addPill);
  const removePill = useBingos((s) => s.removePill);
  const createBingo = useBingos((s) => s.createBingo);
  const removeCompletion = useBingos((s) => s.removeCompletion);
  const setCompletion = useBingos((s) => s.setCompletion);

  const books = useBookshelf((s) => s.books);

  const locked = useBingos((s) => isBingoLocked(id, s.completions));
  const savedAt = bingo?.savedAt;
  const editMode = forceEdit || (!savedAt && !locked);

  const bingoTitle = bingo?.title;
  const [title, setTitle] = useState(bingoTitle ?? '');
  useEffect(() => {
    if (bingoTitle) setTitle(bingoTitle);
  }, [bingoTitle]);

  const readCells = useMemo(() => {
    const s = new Set<number>();
    for (const c of completions) {
      const ub = books.find((x) => x.id === c.userBookId);
      if (ub?.status === 'read') s.add(c.cellIndex);
    }
    return s;
  }, [completions, books]);

  const placedCells = useMemo(
    () => new Set(completions.map((c) => c.cellIndex)),
    [completions],
  );

  if (!bingo) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper">
        <Text className="font-display text-xl text-ink">Bingo introuvable.</Text>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-full bg-accent px-6 py-3">
          <Text className="font-sans-med text-paper">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!editMode) {
    const canEditItems = !locked;
    return (
      <PlayMode
        title={bingo.title}
        items={bingo.items}
        placedCells={placedCells}
        readCells={readCells}
        completionsByCell={new Map(completions.map((c) => [c.cellIndex, c.userBookId]))}
        archived={!!bingo.archivedAt}
        canEditItems={canEditItems}
        onEditItems={() => router.replace(`/bingo/${id}?edit=1`)}
        onPickCell={(cellIndex) => router.push(`/bingo/${id}/pick/${cellIndex}`)}
        onRemoveCell={(cellIndex) => removeCompletion(id, cellIndex)}
        onPlaceBook={(cellIndex, userBookId) => {
          // Si livre déjà placé sur une autre case → retire-le pour
          // garantir l'unicité par grille (cohérent avec le picker).
          const prev = completions.find(
            (c) => c.userBookId === userBookId && c.cellIndex !== cellIndex,
          );
          if (prev) removeCompletion(id, prev.cellIndex);
          setCompletion(id, cellIndex, userBookId);
        }}
        books={books}
        onDelete={() => {
          Alert.alert('Supprimer ce bingo ?', 'Action irréversible.', [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: () => {
                deleteBingo(id);
                router.back();
              },
            },
          ]);
        }}
        onArchive={() => {
          Alert.alert('Archiver ce bingo ?', "Il rejoindra la section « Mes anciens bingos ».", [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Archiver',
              onPress: () => {
                archiveBingo(id);
                router.back();
              },
            },
          ]);
        }}
        onWinNewBingo={() => {
          archiveBingo(id);
          const fresh = createBingo(
            'Nouveau bingo',
            BINGO_PRESETS.map((label, i) => ({ id: newId(), label, position: i })),
          );
          if (fresh) router.replace(`/bingo/${fresh.id}`);
          else router.back();
        }}
      />
    );
  }

  return (
    <EditMode
      title={title}
      alreadySaved={!!savedAt}
      setTitle={(t) => {
        setTitle(t);
        updateBingoTitle(id, t);
      }}
      items={bingo.items}
      setItems={(next) => updateBingoItems(id, next)}
      pills={pills}
      onAddPill={(label) => addPill(label)}
      onRemovePill={(pillId) => removePill(pillId)}
      onDelete={() => {
        Alert.alert('Supprimer ce bingo ?', 'Action irréversible.', [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () => {
              deleteBingo(id);
              router.back();
            },
          },
        ]);
      }}
      onSave={() => {
        markBingoSaved(id);
        if (forceEdit) {
          router.replace(`/bingo/${id}`);
        } else {
          router.replace(`/bingo/${id}`);
        }
      }}
    />
  );
}

// ═══════════════ Edit mode ═══════════════

function EditMode({
  title,
  alreadySaved,
  setTitle,
  items,
  setItems,
  pills,
  onAddPill,
  onRemovePill,
  onDelete,
  onSave,
}: {
  title: string;
  alreadySaved: boolean;
  setTitle: (t: string) => void;
  items: BingoItem[];
  setItems: (items: BingoItem[]) => void;
  pills: { id: string; label: string }[];
  onAddPill: (label: string) => { id: string; label: string } | null;
  onRemovePill: (id: string) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Selected>(null);
  const [customInput, setCustomInput] = useState('');
  const kb = useKeyboardOffset();

  const placedLabels = useMemo(
    () => new Set(items.map((it) => it.label.toLowerCase())),
    [items],
  );

  // Pills disponibles = preset + user lib, moins celles déjà placées.
  const availablePills = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string; source: 'preset' | 'user' }[] = [];

    for (const p of pills) {
      const key = p.label.toLowerCase();
      if (placedLabels.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: p.id, label: p.label, source: 'user' });
    }
    for (const label of BINGO_PRESETS) {
      const key = label.toLowerCase();
      if (placedLabels.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `preset:${label}`, label, source: 'preset' });
    }
    return out;
  }, [pills, placedLabels]);

  const onCellPress = (index: number) => {
    const atIndex = items.find((it) => it.position === index);

    if (!selected) {
      // Rien sélectionné : si case remplie → sélectionne la case.
      if (atIndex) setSelected({ kind: 'cell', index });
      return;
    }

    if (selected.kind === 'cell') {
      if (selected.index === index) {
        setSelected(null);
        return;
      }
      // Swap deux cases.
      const a = items.find((it) => it.position === selected.index);
      const b = items.find((it) => it.position === index);
      if (!a) {
        setSelected(null);
        return;
      }
      const next = items.map((it) => {
        if (it.position === selected.index) return { ...it, position: index };
        if (b && it.position === index) return { ...it, position: selected.index };
        return it;
      });
      setItems(next);
      setSelected(null);
      return;
    }

    // selected = pill
    if (atIndex) {
      // Swap : pill ↔ item. L'item déplacé retourne dans la lib (retirer item).
      const next = items.filter((it) => it.position !== index);
      next.push({
        id: newId(),
        label: labelForSelectedPill(selected.id, pills),
        position: index,
      });
      setItems(next);
    } else {
      const next = [
        ...items,
        {
          id: newId(),
          label: labelForSelectedPill(selected.id, pills),
          position: index,
        },
      ];
      setItems(next);
    }
    setSelected(null);
  };

  const labelForSelectedPill = (
    sid: string,
    lib: { id: string; label: string }[],
  ): string => {
    if (sid.startsWith('preset:')) return sid.slice('preset:'.length);
    return lib.find((p) => p.id === sid)?.label ?? '';
  };

  const onPillPress = (pillId: string) => {
    // Cas 1 : case sélectionnée → remplace le défi de la case par le pill cliqué.
    if (selected?.kind === 'cell') {
      const index = selected.index;
      const label = labelForSelectedPill(pillId, pills);
      const next = items.filter((it) => it.position !== index);
      next.push({ id: newId(), label, position: index });
      setItems(next);
      setSelected(null);
      return;
    }
    // Cas 2 : toggle pill sélectionné.
    if (selected?.kind === 'pill' && selected.id === pillId) {
      setSelected(null);
    } else {
      setSelected({ kind: 'pill', id: pillId });
    }
  };

  const onRemoveCell = () => {
    if (selected?.kind !== 'cell') return;
    const next = items.filter((it) => it.position !== selected.index);
    setItems(next);
    setSelected(null);
  };

  const onSubmitCustom = () => {
    const pill = onAddPill(customInput);
    if (pill) setCustomInput('');
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerClassName="px-4 pt-4 pb-32"
          keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              className="p-1 active:opacity-60">
              <MaterialIcons name="arrow-back" size={24} color="#1f1a16" />
            </Pressable>
            <Pressable
              onPress={onDelete}
              hitSlop={10}
              className="p-1 active:opacity-60">
              <MaterialIcons name="delete-outline" size={24} color="#6b6259" />
            </Pressable>
          </View>

          <Animated.View entering={FadeInDown.duration(300)}>
            <View className="mt-2 flex-row items-center gap-2 border-b border-dashed border-ink-muted/40 pb-1">
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Titre du bingo"
                placeholderTextColor="#9a8f82"
                className="flex-1 font-display text-3xl text-ink"
              />
              <MaterialIcons name="edit" size={18} color="#9a8f82" />
            </View>
            <Text className="mt-2 text-sm text-ink-muted">
              Tape sur un défi puis sur une case pour le placer.
            </Text>
          </Animated.View>

          <View className="mt-4">
            <BingoGrid
              items={items}
              onCellPress={onCellPress}
              highlightSelectedIndex={
                selected?.kind === 'cell' ? selected.index : undefined
              }
            />
          </View>

          {selected?.kind === 'cell' && (
            <Animated.View entering={FadeIn.duration(200)} className="mt-3 items-center">
              <Pressable
                onPress={onRemoveCell}
                className="rounded-full bg-ink px-4 py-2 active:opacity-80">
                <Text className="text-sm font-sans-med text-paper">
                  Retirer de la grille
                </Text>
              </Pressable>
            </Animated.View>
          )}

          <View className="mt-6">
            <Text className="font-display text-lg text-ink">Défis disponibles</Text>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {availablePills.map((p) => {
                const isSelected = selected?.kind === 'pill' && selected.id === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => onPillPress(p.id)}
                    onLongPress={
                      p.source === 'user' ? () => onRemovePill(p.id) : undefined
                    }
                    className={`rounded-full px-3 py-2 ${
                      isSelected ? 'bg-accent' : 'bg-paper-warm'
                    } active:opacity-80`}>
                    <Text
                      numberOfLines={2}
                      className={`text-sm ${isSelected ? 'text-paper' : 'text-ink'}`}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
              {availablePills.length === 0 && (
                <Text className="text-ink-muted">
                  Tous les défis sont placés.
                </Text>
              )}
            </View>
            <Text className="mt-3 text-xs text-ink-muted">
              Appui long sur un défi perso pour le supprimer.
            </Text>
          </View>

          <View className="mt-6">
            <Text className="font-display text-lg text-ink">Nouveau défi</Text>
            <View className="mt-2 flex-row items-center gap-2">
              <TextInput
                value={customInput}
                onChangeText={setCustomInput}
                onSubmitEditing={onSubmitCustom}
                placeholder="Ex : Livre recommandé par un ami"
                placeholderTextColor="#9a8f82"
                className="flex-1 rounded-2xl bg-paper-warm px-4 py-3 text-base text-ink"
              />
              <Pressable
                onPress={onSubmitCustom}
                disabled={!customInput.trim()}
                style={{ opacity: customInput.trim() ? 1 : 0.4 }}
                className="rounded-full bg-accent px-4 py-3 active:opacity-80">
                <MaterialIcons name="add" size={20} color="white" />
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: (kb > 0 ? kb : 0) + 24 }}
          className="items-center">
          <Animated.View entering={FadeIn.duration(220)} className="items-center gap-2">
            {items.length < BINGO_CELLS && (
              <View className="rounded-full bg-ink/80 px-3 py-1">
                <Text className="text-xs text-paper">
                  {items.length}/{BINGO_CELLS} cases remplies
                </Text>
              </View>
            )}
            <Pressable
              onPress={onSave}
              disabled={items.length < BINGO_CELLS}
              accessibilityLabel={alreadySaved ? 'Modifier la grille' : 'Lancer le jeu'}
              className="flex-row items-center gap-2 rounded-full bg-accent px-6 py-3 active:opacity-80"
              style={{
                opacity: items.length < BINGO_CELLS ? 0.4 : 1,
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 8,
                elevation: 4,
              }}>
              <Text className="font-sans-med text-paper">
                {alreadySaved ? 'Modifier la grille ✅' : 'Lancer le jeu 🚀'}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ═══════════════ Play mode ═══════════════

function PlayMode({
  title,
  items,
  placedCells,
  readCells,
  completionsByCell,
  archived,
  canEditItems,
  books,
  onEditItems,
  onPickCell,
  onRemoveCell,
  onPlaceBook,
  onDelete,
  onArchive,
  onWinNewBingo,
}: {
  title: string;
  items: BingoItem[];
  placedCells: Set<number>;
  readCells: Set<number>;
  completionsByCell: Map<number, string>;
  archived: boolean;
  canEditItems: boolean;
  books: UserBook[];
  onEditItems: () => void;
  onPickCell: (cellIndex: number) => void;
  onRemoveCell: (cellIndex: number) => void;
  onPlaceBook: (cellIndex: number, userBookId: string) => void;
  onDelete: () => void;
  onArchive: () => void;
  onWinNewBingo: () => void;
}) {
  const router = useRouter();

  const [showMenu, setShowMenu] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const winSeenRef = useRef(false);

  // Hit-testing pour le drag&drop : origine grille en window coords +
  // layout local de chaque cellule (relatif au container de la grille).
  const gridRef = useRef<View>(null);
  const gridOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cellLayoutsRef = useRef(
    new Map<number, { x: number; y: number; width: number; height: number }>(),
  );

  const remeasureGrid = useCallback(() => {
    gridRef.current?.measureInWindow((x, y) => {
      gridOriginRef.current = { x, y };
    });
  }, []);

  const findCellAt = useCallback((absX: number, absY: number): number | null => {
    const lx = absX - gridOriginRef.current.x;
    const ly = absY - gridOriginRef.current.y;
    for (const [idx, l] of cellLayoutsRef.current) {
      if (lx >= l.x && lx <= l.x + l.width && ly >= l.y && ly <= l.y + l.height) {
        return idx;
      }
    }
    return null;
  }, []);

  const handleHover = useCallback(
    (absX: number, absY: number) => {
      const idx = findCellAt(absX, absY);
      setHoveredIndex(idx);
    },
    [findCellAt],
  );

  const handleDrop = useCallback(
    (userBookId: string, absX: number, absY: number) => {
      const idx = findCellAt(absX, absY);
      setHoveredIndex(null);
      if (idx == null) return;
      onPlaceBook(idx, userBookId);
    },
    [findCellAt, onPlaceBook],
  );

  const handleDragStart = useCallback(() => {
    remeasureGrid();
  }, [remeasureGrid]);

  // Lignes gagnantes actuelles.
  const winLines = useMemo(() => completedLines(readCells), [readCells]);
  const winCells = useMemo(() => {
    const s = new Set<number>();
    for (const line of winLines) for (const c of line) s.add(c);
    return s;
  }, [winLines]);

  // Déclenche la modale la 1re fois qu'au moins une ligne existe.
  useEffect(() => {
    if (archived) return;
    const wonNow = hasAnyWin(readCells);
    if (wonNow && !winSeenRef.current) {
      winSeenRef.current = true;
      setShowWin(true);
    }
    if (!wonNow) winSeenRef.current = false;
  }, [readCells, archived]);

  // Pendant que la popup victoire est ouverte, on suspend le host de toasts
  // de badges : ils s'enchaîneront après fermeture de la popup.
  useEffect(() => {
    if (!showWin) return;
    const { pause, resume } = useBadgeToasts.getState();
    pause();
    return () => resume();
  }, [showWin]);

  const onCellPress = (index: number, _item: BingoItem | undefined) => {
    if (archived) {
      // Lecture seule.
      return;
    }
    // Mode "livre sélectionné" : placer puis sortir du mode.
    if (selectedBookId) {
      onPlaceBook(index, selectedBookId);
      setSelectedBookId(null);
      return;
    }
    onPickCell(index);
  };

  const onBookSelect = (userBookId: string) => {
    setSelectedBookId((prev) => (prev === userBookId ? null : userBookId));
  };

  const renderBadge = ({
    index,
    item,
  }: {
    index: number;
    item?: BingoItem;
  }) => {
    if (!item) return null;
    const userBookId = completionsByCell.get(index);
    if (!userBookId) return null;
    const ub = books.find((x) => x.id === userBookId);
    if (!ub) return null;
    return (
      <View
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          width: 18,
          height: 24,
          borderRadius: 3,
          overflow: 'hidden',
        }}>
        <BookCover
          isbn={ub.book.isbn}
          coverUrl={ub.book.coverUrl}
          style={{ width: 18, height: 24, borderRadius: 3 }}
        />
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="px-4 pt-4 pb-16">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} hitSlop={10} className="p-1 active:opacity-60">
            <MaterialIcons name="arrow-back" size={24} color="#1f1a16" />
          </Pressable>
          <Pressable onPress={() => setShowMenu(true)} hitSlop={10} className="p-1 active:opacity-60">
            <MaterialIcons name="more-vert" size={24} color="#1f1a16" />
          </Pressable>
        </View>

        <Animated.View entering={FadeInDown.duration(300)}>
          <Text className="mt-2 font-display text-3xl text-ink">{title}</Text>
          <Text className="mt-1 text-sm text-ink-muted">
            {placedCells.size}/{BINGO_CELLS} livres placés
            {winLines.length > 0 &&
              ` • ${winLines.length} ligne${
                winLines.length > 1 ? 's' : ''
              } complétée${winLines.length > 1 ? 's' : ''}`}
            {archived && ' • Archivé'}
          </Text>
        </Animated.View>

        <View
          className="mt-4"
          ref={gridRef}
          collapsable={false}
          onLayout={remeasureGrid}>
          <BingoGrid
            items={items}
            completedCells={placedCells}
            readCells={readCells}
            winLineCells={winCells}
            onCellPress={archived ? undefined : onCellPress}
            renderBadge={renderBadge}
            hoveredIndex={hoveredIndex}
            onCellLayout={(index, layout) => {
              cellLayoutsRef.current.set(index, layout);
            }}
          />
        </View>

        {!archived && (
          <View className="mt-6">
            <Text className="font-display text-lg text-ink">Ma bibliothèque</Text>
            <Text className="mt-1 text-xs text-ink-muted">
              {selectedBookId
                ? 'Tape une case pour y placer le livre sélectionné.'
                : 'Tape un livre puis une case, ou maintiens-le pour le glisser.'}
            </Text>
            {books.length === 0 ? (
              <Text className="mt-3 text-ink-muted">
                Ajoute d&apos;abord des livres à ta bibliothèque pour les placer.
              </Text>
            ) : (
              <View className="mt-3 flex-row flex-wrap gap-3">
                {books.map((ub) => {
                  const isPlaced = [...completionsByCell.values()].includes(ub.id);
                  return (
                    <DraggableBook
                      key={ub.id}
                      ub={ub}
                      isPlaced={isPlaced}
                      isSelected={selectedBookId === ub.id}
                      onSelect={onBookSelect}
                      onDragStart={handleDragStart}
                      onHover={handleHover}
                      onDrop={handleDrop}
                    />
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View className="mt-6 gap-3">
          {[...completionsByCell.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([cellIndex, userBookId]) => {
              const item = items.find((it) => it.position === cellIndex);
              const ub = books.find((x) => x.id === userBookId);
              if (!item || !ub) return null;
              return (
                <Pressable
                  key={cellIndex}
                  onPress={() => router.push(`/book/${ub.book.isbn}`)}
                  className="flex-row items-center gap-3 rounded-2xl bg-paper-warm p-3 active:opacity-80">
                  <BookCover
                    isbn={ub.book.isbn}
                    coverUrl={ub.book.coverUrl}
                    style={{ width: 36, height: 54, borderRadius: 4 }}
                  />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-xs text-ink-muted">
                      {item.label}
                    </Text>
                    <Text numberOfLines={1} className="font-sans-med text-ink">
                      {ub.book.title}
                    </Text>
                    <Text className="text-xs text-ink-soft">
                      {ub.status === 'read'
                        ? 'Lu'
                        : ub.status === 'reading'
                          ? 'En cours'
                          : ub.status === 'to_read'
                            ? 'À lire'
                            : 'Abandonné'}
                    </Text>
                  </View>
                  {!archived && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        onRemoveCell(cellIndex);
                      }}
                      hitSlop={8}
                      className="p-1 active:opacity-60">
                      <MaterialIcons name="close" size={20} color="#6b6259" />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={showMenu}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}>
        <Pressable
          onPress={() => setShowMenu(false)}
          className="flex-1 items-end bg-ink/40 px-4 pt-14">
          <View className="w-56 rounded-2xl bg-paper p-2">
            {canEditItems && !archived && (
              <Pressable
                onPress={() => {
                  setShowMenu(false);
                  onEditItems();
                }}
                className="flex-row items-center gap-2 rounded-xl px-3 py-3 active:bg-paper-warm">
                <MaterialIcons name="edit" size={18} color="#1f1a16" />
                <Text className="text-ink">Modifier la grille</Text>
              </Pressable>
            )}
            {!archived && (
              <Pressable
                onPress={() => {
                  setShowMenu(false);
                  onArchive();
                }}
                className="flex-row items-center gap-2 rounded-xl px-3 py-3 active:bg-paper-warm">
                <MaterialIcons name="archive" size={18} color="#1f1a16" />
                <Text className="text-ink">Archiver</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setShowMenu(false);
                onDelete();
              }}
              className="flex-row items-center gap-2 rounded-xl px-3 py-3 active:bg-paper-warm">
              <MaterialIcons name="delete-outline" size={18} color="#b8503a" />
              <Text style={{ color: '#b8503a' }}>Supprimer</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={showWin}
        animationType="fade"
        onRequestClose={() => setShowWin(false)}>
        <View className="flex-1 items-center justify-center bg-ink/60 px-6">
          <View className="w-full max-w-md rounded-3xl bg-paper p-6">
            <Text className="text-center font-display text-3xl text-ink">
              Bingo ! 🎉
            </Text>
            <Text className="mt-2 text-center text-ink-muted">
              Tu as complété une ligne. Tu peux continuer sur cette grille ou en
              ouvrir une nouvelle (celle-ci sera archivée).
            </Text>
            <View className="mt-6 gap-2">
              <Pressable
                onPress={() => {
                  setShowWin(false);
                  onWinNewBingo();
                }}
                className="rounded-full bg-accent py-3 active:opacity-80">
                <Text className="text-center font-sans-med text-paper">
                  Nouveau bingo
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowWin(false)}
                className="rounded-full border border-ink-muted/30 py-3 active:opacity-70">
                <Text className="text-center text-ink-muted">Continuer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ═══════════════ Draggable book ═══════════════

function DraggableBook({
  ub,
  isPlaced,
  isSelected,
  onSelect,
  onDragStart,
  onHover,
  onDrop,
}: {
  ub: UserBook;
  isPlaced: boolean;
  isSelected: boolean;
  onSelect: (userBookId: string) => void;
  onDragStart: () => void;
  onHover: (absX: number, absY: number) => void;
  onDrop: (userBookId: string, absX: number, absY: number) => void;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dragging = useSharedValue(0);

  // Press court de 50 ms avant activation du drag.
  const pan = Gesture.Pan()
    .activateAfterLongPress(50)
    .onStart(() => {
      dragging.value = withSpring(1);
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
      runOnJS(onHover)(e.absoluteX, e.absoluteY);
    })
    .onEnd((e) => {
      runOnJS(onDrop)(ub.id, e.absoluteX, e.absoluteY);
      tx.value = withSpring(0);
      ty.value = withSpring(0);
      dragging.value = withSpring(0);
    })
    .onFinalize(() => {
      tx.value = withSpring(0);
      ty.value = withSpring(0);
      dragging.value = withSpring(0);
    });

  // Tap court → toggle sélection. Exclusive : pan (long-press) gagne s'il
  // s'active, sinon le tap fire au release.
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_e, success) => {
      if (success) runOnJS(onSelect)(ub.id);
    });

  const composed = Gesture.Exclusive(pan, tap);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: 1 + dragging.value * 0.08 },
    ],
    zIndex: dragging.value > 0 ? 100 : 0,
    elevation: dragging.value > 0 ? 12 : 0,
    shadowOpacity: dragging.value * 0.35,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          { width: 80 },
          style,
          {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 10,
          },
        ]}
        className="items-center">
        <View
          style={{
            opacity: isPlaced ? 0.45 : 1,
            borderWidth: isSelected ? 3 : 0,
            borderColor: '#c27b52',
            borderRadius: 8,
            padding: isSelected ? 1 : 0,
          }}>
          <BookCover
            isbn={ub.book.isbn}
            coverUrl={ub.book.coverUrl}
            style={{ width: 70, height: 100, borderRadius: 6 }}
          />
        </View>
        <Text numberOfLines={2} className="mt-1 text-center text-[11px] text-ink">
          {ub.book.title}
        </Text>
        {isPlaced && (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: '#5fa84d',
            }}
            className="items-center justify-center">
            <MaterialIcons name="check" size={12} color="white" />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
