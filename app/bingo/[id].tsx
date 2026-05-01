import { BingoGrid } from '@/components/bingo-grid';
import { BookCover } from '@/components/book-cover';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { BINGO_PRESETS, pickInitialPresetLabels } from '@/lib/bingo-presets';
import { completedLines, hasAnyWin } from '@/lib/bingo-win';
import { newId } from '@/lib/id';
import { makeFondTokenOverrides } from '@/lib/sheet-appearance';
import { useBadgeToasts } from '@/store/badge-toasts';
import { BingoCustomizer } from '@/components/bingo-customizer';
import { useBingos, isBingoLocked } from '@/store/bingo';
import { useBookshelf } from '@/store/bookshelf';
import { useSheetTemplates } from '@/store/sheet-templates';
import type { SheetAppearance } from '@/types/book';
import type { BingoCompletion, BingoItem } from '@/types/bingo';
import { BINGO_CELLS } from '@/types/bingo';

const EMPTY_COMPLETIONS: BingoCompletion[] = [];
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { UserBook } from '@/types/book';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BingoScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const router = useRouter();
  const forceEdit = edit === '1';

  const bingo = useBingos((s) => s.bingos.find((b) => b.id === id));
  const completions = useBingos((s) => s.completions[id]) ?? EMPTY_COMPLETIONS;
  const pills = useBingos((s) => s.pills);

  const updateBingoItems = useBingos((s) => s.updateBingoItems);
  const updateBingoTitle = useBingos((s) => s.updateBingoTitle);
  const setBingoAppearance = useBingos((s) => s.setBingoAppearance);
  const markBingoSaved = useBingos((s) => s.markBingoSaved);
  const archiveBingo = useBingos((s) => s.archiveBingo);
  const deleteBingo = useBingos((s) => s.deleteBingo);
  const addPill = useBingos((s) => s.addPill);
  const renamePill = useBingos((s) => s.renamePill);
  const removePill = useBingos((s) => s.removePill);
  const createBingo = useBingos((s) => s.createBingo);
  const removeCompletion = useBingos((s) => s.removeCompletion);
  const setCompletion = useBingos((s) => s.setCompletion);

  const globalAppearance = useSheetTemplates((s) => s.global);

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

  const effectiveAppearance: SheetAppearance =
    bingo.appearance ?? globalAppearance;

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
        appearance={effectiveAppearance}
        onSetAppearance={(next) => setBingoAppearance(id, next)}
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
            pickInitialPresetLabels().map((label, i) => ({ id: newId(), label, position: i })),
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
      appearance={effectiveAppearance}
      onSetAppearance={(next) => setBingoAppearance(id, next)}
      onAddPill={(label) => addPill(label)}
      onRenamePill={(pillId, label) => renamePill(pillId, label)}
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
  appearance,
  onSetAppearance,
  onAddPill,
  onRenamePill,
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
  appearance: SheetAppearance;
  onSetAppearance: (next: SheetAppearance | undefined) => void;
  onAddPill: (label: string) => { id: string; label: string } | null;
  onRenamePill: (id: string, label: string) => void;
  onRemovePill: (id: string) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const router = useRouter();
  const theme = useThemeColors();
  // La grille est posée sur la page (bg = `theme.paper`). On remappe les
  // tokens fond du cadre SVG vers cette couleur d'environnement.
  const tokenOverrides = useMemo(
    () => makeFondTokenOverrides(theme.paper),
    [theme.paper],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetCell, setTargetCell] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [undoStack, setUndoStack] = useState<BingoItem[][]>([]);
  const [redoStack, setRedoStack] = useState<BingoItem[][]>([]);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [pillActions, setPillActions] = useState<{
    id: string;
    left: number;
    top: number;
  } | null>(null);
  const pillBtnRefs = useRef(new Map<string, View>());
  const [editingPill, setEditingPill] = useState<{ id: string; label: string } | null>(null);
  const [dragSource, setDragSource] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragSize, setDragSize] = useState<{ width: number; height: number } | null>(null);

  const insets = useSafeAreaInsets();
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragVisible = useSharedValue(0);

  const gridRef = useRef<View>(null);
  const gridOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const gridSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const cellLayoutsRef = useRef(
    new Map<number, { x: number; y: number; width: number; height: number }>(),
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const dragSourceRef = useRef<number | null>(null);

  const remeasureGrid = useCallback(() => {
    gridRef.current?.measureInWindow((x, y, w, h) => {
      gridOriginRef.current = { x, y };
      gridSizeRef.current = { width: w, height: h };
    });
  }, []);

  const isInsideGrid = useCallback((absX: number, absY: number) => {
    const lx = absX - gridOriginRef.current.x;
    const ly = absY - gridOriginRef.current.y;
    const { width, height } = gridSizeRef.current;
    return lx >= 0 && lx <= width && ly >= 0 && ly <= height;
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

  const handleDragStart = useCallback(
    (absX: number, absY: number) => {
      remeasureGrid();
      const idx = findCellAt(absX, absY);
      if (idx == null) return;
      const src = itemsRef.current.find((it) => it.position === idx);
      if (!src) {
        // Long-press sur case vide : pas de drag, on ouvre le menu comme
        // pour un tap (l'activation Pan a annulé le Pressable underlying).
        setTargetCell(idx);
        setPickerOpen(true);
        return;
      }
      const layout = cellLayoutsRef.current.get(idx);
      dragSourceRef.current = idx;
      setDragSource(idx);
      setHoveredIndex(idx);
      setDragLabel(src.label);
      if (layout) setDragSize({ width: layout.width, height: layout.height });
      dragVisible.value = 1;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [dragVisible, findCellAt, remeasureGrid],
  );

  const handleDragUpdate = useCallback(
    (absX: number, absY: number) => {
      if (dragSourceRef.current == null) return;
      const idx = findCellAt(absX, absY);
      setHoveredIndex(idx);
    },
    [findCellAt],
  );

  const handleDragEnd = useCallback(
    (absX: number, absY: number) => {
      const target = findCellAt(absX, absY);
      const inside = isInsideGrid(absX, absY);
      const source = dragSourceRef.current;
      dragSourceRef.current = null;
      setDragSource(null);
      setHoveredIndex(null);
      if (source == null) return;
      const current = itemsRef.current;
      const srcItem = current.find((it) => it.position === source);
      if (!srcItem) return;
      if (target === source) return;
      let next: BingoItem[];
      if (target == null) {
        if (inside) {
          // Drop sur fond de grille (entre cases) → annule, retour origine.
          return;
        }
        // Drop hors grille → retire le défi de la case source.
        next = current.filter((it) => it.position !== source);
      } else {
        const tgtItem = current.find((it) => it.position === target);
        if (tgtItem) {
          next = current.map((it) => {
            if (it.position === source) return { ...it, position: target };
            if (it.position === target) return { ...it, position: source };
            return it;
          });
        } else {
          next = current.map((it) =>
            it.position === source ? { ...it, position: target } : it,
          );
        }
      }
      setUndoStack((u) => [...u.slice(-9), current]);
      setRedoStack([]);
      setItems(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [findCellAt, isInsideGrid, setItems],
  );

  const handleDragCancel = useCallback(() => {
    dragSourceRef.current = null;
    setDragSource(null);
    setHoveredIndex(null);
    setDragLabel(null);
    setDragSize(null);
    dragVisible.value = 0;
  }, [dragVisible]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(150)
        .onStart((e) => {
          dragX.value = e.absoluteX;
          dragY.value = e.absoluteY;
          runOnJS(handleDragStart)(e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          dragX.value = e.absoluteX;
          dragY.value = e.absoluteY;
          runOnJS(handleDragUpdate)(e.absoluteX, e.absoluteY);
        })
        .onEnd((e) => {
          runOnJS(handleDragEnd)(e.absoluteX, e.absoluteY);
        })
        .onFinalize(() => {
          runOnJS(handleDragCancel)();
        }),
    [dragX, dragY, handleDragStart, handleDragUpdate, handleDragEnd, handleDragCancel],
  );

  const ghostStyle = useAnimatedStyle(() => {
    const w = dragSize?.width ?? 0;
    const h = dragSize?.height ?? 0;
    return {
      opacity: dragVisible.value,
      transform: [
        { translateX: dragX.value - w / 2 },
        { translateY: dragY.value - h / 2 - insets.top },
      ],
    };
  }, [dragSize, insets.top]);

  const onCellLayout = useCallback(
    (
      index: number,
      layout: { x: number; y: number; width: number; height: number },
    ) => {
      cellLayoutsRef.current.set(index, layout);
    },
    [],
  );

  const placedLabels = useMemo(
    () => new Set(items.map((it) => it.label.toLowerCase())),
    [items],
  );

  // Défis dispo = user lib + presets, moins ceux déjà placés.
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

  const filteredPills = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availablePills;
    return availablePills.filter((p) => p.label.toLowerCase().includes(q));
  }, [availablePills, search]);

  const exactMatchExists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return false;
    return availablePills.some((p) => p.label.toLowerCase() === q)
      || placedLabels.has(q);
  }, [availablePills, placedLabels, search]);

  const onUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r.slice(-9), items]);
    setItems(prev);
    setUndoStack((u) => u.slice(0, -1));
  };

  const onRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u.slice(-9), items]);
    setItems(next);
    setRedoStack((r) => r.slice(0, -1));
  };

  const applyPickedLabel = (label: string) => {
    if (targetCell == null) return;
    setUndoStack((u) => [...u.slice(-9), items]);
    setRedoStack([]);
    const next = items.filter((it) => it.position !== targetCell);
    next.push({ id: newId(), label, position: targetCell });
    setItems(next);
    setTargetCell(null);
    setPickerOpen(false);
    setSearch('');
  };

  const onCellPress = (index: number) => {
    setTargetCell(index);
    setPickerOpen(true);
  };

  const onPickPill = (label: string) => {
    applyPickedLabel(label);
  };

  const onAddCustom = () => {
    const text = search.trim();
    if (!text) return;
    const existing = availablePills.find(
      (p) => p.label.toLowerCase() === text.toLowerCase(),
    );
    if (existing) {
      applyPickedLabel(existing.label);
    } else {
      const pill = onAddPill(text);
      if (pill) applyPickedLabel(pill.label);
    }
  };

  const onClosePicker = () => {
    setPickerOpen(false);
    setSearch('');
    setTargetCell(null);
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
            <View className="flex-row items-center gap-3">
              {!alreadySaved && items.length < BINGO_CELLS && (
                <Text className="text-xs text-ink-muted">
                  {items.length}/{BINGO_CELLS}
                </Text>
              )}
              <Pressable
                onPress={() => setCustomizerOpen(true)}
                hitSlop={10}
                accessibilityLabel="Personnaliser"
                className="p-1 active:opacity-60">
                <MaterialIcons name="palette" size={22} color="#1f1a16" />
              </Pressable>
              <Pressable
                onPress={onUndo}
                disabled={undoStack.length === 0}
                hitSlop={10}
                accessibilityLabel="Annuler"
                style={{ opacity: undoStack.length === 0 ? 0.3 : 1 }}
                className="p-1 active:opacity-60">
                <MaterialIcons name="undo" size={22} color="#1f1a16" />
              </Pressable>
              <Pressable
                onPress={onRedo}
                disabled={redoStack.length === 0}
                hitSlop={10}
                accessibilityLabel="Rétablir"
                style={{ opacity: redoStack.length === 0 ? 0.3 : 1 }}
                className="p-1 active:opacity-60">
                <MaterialIcons name="redo" size={22} color="#1f1a16" />
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={items.length < BINGO_CELLS}
                accessibilityLabel={alreadySaved ? 'Valider la grille' : 'Lancer le jeu'}
                className="rounded-full bg-accent px-4 py-2 active:opacity-80"
                style={{ opacity: items.length < BINGO_CELLS ? 0.4 : 1 }}>
                <Text className="font-sans-med text-paper">
                  {alreadySaved ? 'Valider ✅' : 'Lancer 🚀'}
                </Text>
              </Pressable>
            </View>
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
              Tape sur une case pour choisir un défi. Appui long pour réarranger les cases.
            </Text>
          </Animated.View>

          <GestureDetector gesture={panGesture}>
            <View
              ref={gridRef}
              collapsable={false}
              className="mt-4"
              onLayout={remeasureGrid}>
              <BingoGrid
                items={items}
                onCellPress={onCellPress}
                onCellLayout={onCellLayout}
                hoveredIndex={hoveredIndex}
                dragSourceIndex={dragSource}
                appearance={appearance}
                tokenOverrides={tokenOverrides}
              />
            </View>
          </GestureDetector>
        </ScrollView>
      </KeyboardAvoidingView>

      <BingoCustomizer
        open={customizerOpen}
        appearance={appearance}
        title="Personnaliser la grille"
        subtitle={title}
        onClose={() => setCustomizerOpen(false)}
        onSave={(next) => {
          onSetAppearance(next);
          setCustomizerOpen(false);
        }}
        onReset={() => onSetAppearance(undefined)}
        resetLabel="Reprendre le template global"
      />

      <Pressable
        onPress={onDelete}
        accessibilityLabel="Supprimer le bingo"
        style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}
        className="flex-row items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 active:opacity-80">
        <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
        <Text className="font-sans-med text-red-600">
          Supprimer le bingo
        </Text>
      </Pressable>

      {dragLabel && dragSize && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: dragSize.width,
              height: dragSize.height,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowOffset: { width: 0, height: 6 },
              shadowRadius: 12,
              elevation: 8,
            },
            ghostStyle,
          ]}>
          <View
            style={{ flex: 1, padding: 4, borderRadius: 8, borderWidth: 2 }}
            className="items-center justify-center border-accent bg-paper">
            <Text
              numberOfLines={4}
              adjustsFontSizeToFit
              className="text-center text-xs text-ink">
              {dragLabel}
            </Text>
          </View>
        </Animated.View>
      )}

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={onClosePicker}>
        <Pressable className="flex-1 bg-black/30" onPress={onClosePicker} />
        <View
          className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper pt-3"
          style={{ height: '70%' }}>
          <View className="items-center pb-2">
            <View className="h-1 w-12 rounded-full bg-ink-muted/30" />
          </View>
          <View className="flex-row items-center gap-2 px-4">
            <View className="flex-1 flex-row items-center rounded-2xl bg-paper-warm px-3">
              <MaterialIcons name="search" size={18} color="#6b6259" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Chercher ou créer un défi"
                placeholderTextColor="#9a8f82"
                returnKeyType="search"
                onSubmitEditing={onAddCustom}
                className="flex-1 px-2 py-3 text-base text-ink"
                autoFocus
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch('')}
                  hitSlop={10}
                  className="p-1 active:opacity-60">
                  <MaterialIcons name="close" size={18} color="#6b6259" />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={onAddCustom}
              disabled={!search.trim() || exactMatchExists}
              accessibilityLabel="Créer ce défi"
              style={{
                opacity: !search.trim() || exactMatchExists ? 0.4 : 1,
              }}
              className="rounded-full bg-accent p-3 active:opacity-80">
              <MaterialIcons name="add" size={20} color="white" />
            </Pressable>
          </View>
          <ScrollView
            contentContainerClassName="px-4 py-4"
            keyboardShouldPersistTaps="handled">
            <View className="flex-row flex-wrap gap-2">
              {filteredPills.map((p) => (
                <View
                  key={p.id}
                  className="self-start flex-row items-stretch overflow-hidden rounded-2xl bg-paper-warm">
                  <Pressable
                    onPress={() => onPickPill(p.label)}
                    className="px-4 py-2 active:opacity-80">
                    <Text className="text-base text-ink">{p.label}</Text>
                  </Pressable>
                  {p.source === 'user' && (
                    <>
                      <View className="my-1 w-px bg-ink-muted/25" />
                      <Pressable
                        ref={(node) => {
                          if (node) pillBtnRefs.current.set(p.id, node as unknown as View);
                          else pillBtnRefs.current.delete(p.id);
                        }}
                        onPress={() => {
                          const node = pillBtnRefs.current.get(p.id);
                          if (!node) return;
                          (node as unknown as View).measureInWindow(
                            (x, y, w, h) => {
                              const MENU_W = 180;
                              const left = Math.max(8, x + w - MENU_W);
                              const top = y + h + 4;
                              setPillActions({ id: p.id, left, top });
                            },
                          );
                        }}
                        accessibilityLabel="Actions du défi"
                        className="px-3 active:opacity-60 items-center justify-center">
                        <MaterialIcons
                          name="more-horiz"
                          size={18}
                          color="#6b6259"
                        />
                      </Pressable>
                    </>
                  )}
                </View>
              ))}
            </View>
            {filteredPills.length === 0 && (
              <Text className="px-2 py-8 text-center text-ink-muted">
                {!search.trim()
                  ? 'Tous les défis sont placés.'
                  : exactMatchExists
                    ? `« ${search.trim()} » est déjà placé sur la grille.`
                    : `Aucun défi. Tape « + » pour créer « ${search.trim()} ».`}
              </Text>
            )}
          </ScrollView>
        </View>

        {pillActions !== null && (
          <Pressable
            onPress={() => setPillActions(null)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}>
            <View
              style={{
                position: 'absolute',
                top: pillActions.top,
                left: pillActions.left,
                width: 180,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowOffset: { width: 0, height: 6 },
                shadowRadius: 12,
                elevation: 8,
              }}
              className="rounded-2xl border border-ink-muted/15 bg-paper p-1">
              <Pressable
                onPress={() => {
                  const p = pills.find((x) => x.id === pillActions.id);
                  if (p) setEditingPill({ id: p.id, label: p.label });
                  setPillActions(null);
                }}
                className="flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-paper-warm">
                <MaterialIcons name="edit" size={18} color="#1f1a16" />
                <Text className="font-sans-med text-ink">Éditer</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onRemovePill(pillActions.id);
                  setPillActions(null);
                }}
                className="flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-red-500/10">
                <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
                <Text className="font-sans-med text-red-600">Retirer</Text>
              </Pressable>
            </View>
          </Pressable>
        )}

        {editingPill !== null && (
          <Pressable
            onPress={() => setEditingPill(null)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              justifyContent: 'center',
              paddingHorizontal: 24,
            }}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="rounded-3xl bg-paper p-5">
              <Text className="font-display text-xl text-ink">Éditer le défi</Text>
              <View className="mt-4 rounded-2xl bg-paper-warm px-4 py-3">
                <TextInput
                  value={editingPill?.label ?? ''}
                  onChangeText={(t) =>
                    setEditingPill((s) => (s ? { ...s, label: t } : s))
                  }
                  placeholder="Label du défi"
                  placeholderTextColor="#9a8f82"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (editingPill && editingPill.label.trim()) {
                      onRenamePill(editingPill.id, editingPill.label);
                      setEditingPill(null);
                    }
                  }}
                  className="text-base text-ink"
                />
              </View>
              <View className="mt-5 flex-row gap-2">
                <Pressable
                  onPress={() => setEditingPill(null)}
                  className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
                  <Text className="text-center text-ink-muted">Annuler</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (editingPill && editingPill.label.trim()) {
                      onRenamePill(editingPill.id, editingPill.label);
                      setEditingPill(null);
                    }
                  }}
                  disabled={!editingPill?.label.trim()}
                  style={{ opacity: editingPill?.label.trim() ? 1 : 0.4 }}
                  className="flex-1 rounded-full bg-accent py-3 active:opacity-80">
                  <Text className="text-center font-sans-med text-paper">
                    Enregistrer
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        )}
      </Modal>
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
  appearance,
  onSetAppearance,
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
  appearance: SheetAppearance;
  onSetAppearance: (next: SheetAppearance | undefined) => void;
  onEditItems: () => void;
  onPickCell: (cellIndex: number) => void;
  onRemoveCell: (cellIndex: number) => void;
  onPlaceBook: (cellIndex: number, userBookId: string) => void;
  onDelete: () => void;
  onArchive: () => void;
  onWinNewBingo: () => void;
}) {
  const router = useRouter();
  const theme = useThemeColors();
  // Cf. EditMode : grille posée sur la page (bg = `theme.paper`).
  const tokenOverrides = useMemo(
    () => makeFondTokenOverrides(theme.paper),
    [theme.paper],
  );

  const [showMenu, setShowMenu] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
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

  const renderBackground = ({
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
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 6,
          overflow: 'hidden',
        }}>
        <BookCover
          isbn={ub.book.isbn}
          coverUrl={ub.book.coverUrl}
          contentFit="cover"
          style={{ width: '100%', height: '100%', opacity: 0.5 }}
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
          <View className="flex-row items-center gap-3">
            {!archived && (
              <Pressable
                onPress={() => setCustomizerOpen(true)}
                hitSlop={10}
                accessibilityLabel="Personnaliser"
                className="p-1 active:opacity-60">
                <MaterialIcons name="palette" size={22} color="#1f1a16" />
              </Pressable>
            )}
            <Pressable onPress={() => setShowMenu(true)} hitSlop={10} className="p-1 active:opacity-60">
              <MaterialIcons name="more-vert" size={24} color="#1f1a16" />
            </Pressable>
          </View>
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
            renderBackground={renderBackground}
            hoveredIndex={hoveredIndex}
            appearance={appearance}
            tokenOverrides={tokenOverrides}
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

      <BingoCustomizer
        open={customizerOpen}
        appearance={appearance}
        title="Personnaliser la grille"
        subtitle={title}
        onClose={() => setCustomizerOpen(false)}
        onSave={(next) => {
          onSetAppearance(next);
          setCustomizerOpen(false);
        }}
        onReset={() => onSetAppearance(undefined)}
        resetLabel="Reprendre le template global"
      />
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
