import { BingoCustomizer } from "@/components/bingo-customizer";
import { BingoGrid } from "@/components/bingo-grid";
import { BookCover } from "@/components/book-cover";
import { ProposeBingoPillModal } from "@/components/propose-bingo-pill-modal";
import { UserCard } from "@/components/user-card";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { BINGO_PRESETS, pickInitialPresetLabels } from "@/lib/bingo-presets";
import { completedLines, hasAnyWin } from "@/lib/bingo-win";
import { newId } from "@/lib/id";
import { READING_STATUS_META } from "@/lib/reading-status";
import { makeFondTokenOverrides } from "@/lib/sheet-appearance";
import { useBadgeToasts } from "@/store/badge-toasts";
import { isBingoLocked, useBingos } from "@/store/bingo";
import { useBookshelf } from "@/store/bookshelf";
import { useSheetTemplates } from "@/store/sheet-templates";
import type { BingoCompletion, BingoItem, BingoPill } from "@/types/bingo";
import { BINGO_CELLS } from "@/types/bingo";
import type { SheetAppearance, UserBook } from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const EMPTY_COMPLETIONS: BingoCompletion[] = [];

export default function BingoScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const router = useRouter();
  const forceEdit = edit === "1";

  const bingo = useBingos((s) => s.bingos.find((b) => b.id === id));
  const completions = useBingos((s) => s.completions[id]) ?? EMPTY_COMPLETIONS;
  const pills = useBingos((s) => s.pills);
  const publicPills = useBingos((s) => s.publicPills);

  const updateBingoItems = useBingos((s) => s.updateBingoItems);
  const updateBingoTitle = useBingos((s) => s.updateBingoTitle);
  const setBingoAppearance = useBingos((s) => s.setBingoAppearance);
  const markBingoSaved = useBingos((s) => s.markBingoSaved);
  const archiveBingo = useBingos((s) => s.archiveBingo);
  const deleteBingo = useBingos((s) => s.deleteBingo);
  const addPill = useBingos((s) => s.addPill);
  const renamePill = useBingos((s) => s.renamePill);
  const removePill = useBingos((s) => s.removePill);
  const fetchPublicPills = useBingos((s) => s.fetchPublicPills);
  const createBingo = useBingos((s) => s.createBingo);
  const removeCompletion = useBingos((s) => s.removeCompletion);
  const setCompletion = useBingos((s) => s.setCompletion);

  // Pré-charge les pills `public` d'autres users pour enrichir le picker
  // d'édition. Best-effort (pas bloquant) ; rafraîchi à chaque entrée sur
  // l'écran pour récupérer les nouvelles approbations admin.
  useEffect(() => {
    void fetchPublicPills();
  }, [fetchPublicPills]);

  const globalAppearance = useSheetTemplates((s) => s.global);

  const books = useBookshelf((s) => s.books);

  const locked = useBingos((s) => isBingoLocked(id, s.completions));
  const savedAt = bingo?.savedAt;
  const editMode = forceEdit || (!savedAt && !locked);

  const bingoTitle = bingo?.title;
  const [title, setTitle] = useState(bingoTitle ?? "");
  useEffect(() => {
    if (bingoTitle) setTitle(bingoTitle);
  }, [bingoTitle]);

  const readCells = useMemo(() => {
    const s = new Set<number>();
    for (const c of completions) {
      const ub = books.find((x) => x.id === c.userBookId);
      if (ub?.status === "read") s.add(c.cellIndex);
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
        <Text className="font-display text-xl text-ink">
          Bingo introuvable.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-full bg-accent px-6 py-3"
        >
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
        completionsByCell={
          new Map(completions.map((c) => [c.cellIndex, c.userBookId]))
        }
        archived={!!bingo.archivedAt}
        canEditItems={canEditItems}
        appearance={effectiveAppearance}
        onSetAppearance={(next) => setBingoAppearance(id, next)}
        onEditItems={() => router.replace(`/bingo/${id}?edit=1`)}
        onPickCell={(cellIndex) =>
          router.push(`/bingo/${id}/pick/${cellIndex}`)
        }
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
          Alert.alert("Supprimer ce bingo ?", "Action irréversible.", [
            { text: "Annuler", style: "cancel" },
            {
              text: "Supprimer",
              style: "destructive",
              onPress: () => {
                deleteBingo(id);
                router.back();
              },
            },
          ]);
        }}
        onArchive={() => {
          Alert.alert(
            "Archiver ce bingo ?",
            "Il rejoindra la section « Mes anciens bingos ».",
            [
              { text: "Annuler", style: "cancel" },
              {
                text: "Archiver",
                onPress: () => {
                  archiveBingo(id);
                  router.back();
                },
              },
            ],
          );
        }}
        onWinNewBingo={() => {
          archiveBingo(id);
          const fresh = createBingo(
            "Nouveau bingo",
            pickInitialPresetLabels().map((label, i) => ({
              id: newId(),
              label,
              position: i,
            })),
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
      publicPills={publicPills}
      appearance={effectiveAppearance}
      onSetAppearance={(next) => setBingoAppearance(id, next)}
      onAddPill={(label) => addPill(label)}
      onRenamePill={(pillId, label) => renamePill(pillId, label)}
      onRemovePill={(pillId) => removePill(pillId)}
      onDelete={() => {
        Alert.alert("Supprimer ce bingo ?", "Action irréversible.", [
          { text: "Annuler", style: "cancel" },
          {
            text: "Supprimer",
            style: "destructive",
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
  publicPills,
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
  pills: BingoPill[];
  publicPills: BingoPill[];
  appearance: SheetAppearance;
  onSetAppearance: (next: SheetAppearance | undefined) => void;
  onAddPill: (label: string) => BingoPill | null;
  onRenamePill: (id: string, label: string) => void;
  onRemovePill: (id: string) => Promise<void>;
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
  const [search, setSearch] = useState("");
  // Filtre source actif dans le picker : si vide → tous les défis ; sinon
  // on ne montre que ceux dont la source est dans le Set. Persiste par
  // session de picker (reset au close pour rester prévisible).
  const [sourceFilters, setSourceFilters] = useState<
    Set<"user" | "public" | "preset">
  >(() => new Set());
  const [undoStack, setUndoStack] = useState<BingoItem[][]>([]);
  const [redoStack, setRedoStack] = useState<BingoItem[][]>([]);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [pillActions, setPillActions] = useState<{
    id: string;
    // 'user' = pill perso (édition + modération possibles).
    // 'public' = pill publique d'un autre user (read-only : auteur + message
    // admin uniquement).
    source: "user" | "public";
    left: number;
    top: number;
  } | null>(null);
  const pillBtnRefs = useRef(new Map<string, View>());
  const [editingPill, setEditingPill] = useState<{
    id: string;
    label: string;
  } | null>(null);
  // ID de la pill dont on affiche la modale de proposition admin. null = fermée.
  const [proposeModalPillId, setProposeModalPillId] = useState<string | null>(
    null,
  );
  const [dragSource, setDragSource] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragSize, setDragSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const insets = useSafeAreaInsets();
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragVisible = useSharedValue(0);

  const gridRef = useRef<View>(null);
  const gridOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const gridSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
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

  const findCellAt = useCallback(
    (absX: number, absY: number): number | null => {
      const lx = absX - gridOriginRef.current.x;
      const ly = absY - gridOriginRef.current.y;
      for (const [idx, l] of cellLayoutsRef.current) {
        if (
          lx >= l.x &&
          lx <= l.x + l.width &&
          ly >= l.y &&
          ly <= l.y + l.height
        ) {
          return idx;
        }
      }
      return null;
    },
    [],
  );

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
    [
      dragX,
      dragY,
      handleDragStart,
      handleDragUpdate,
      handleDragEnd,
      handleDragCancel,
    ],
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

  // Défis dispo = user lib (sauf disabled) + community public + presets,
  // moins ceux déjà placés. Une pill `disabled` reste en DB mais n'apparaît
  // plus dans le picker du créateur (soft-delete admin, cf. 0060).
  const availablePills = useMemo(() => {
    const seen = new Set<string>();
    const out: {
      id: string;
      label: string;
      source: "preset" | "user" | "public";
      pill?: BingoPill;
    }[] = [];

    for (const p of pills) {
      if (p.status === "disabled") continue;
      const key = p.label.toLowerCase();
      if (placedLabels.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: p.id, label: p.label, source: "user", pill: p });
    }
    for (const p of publicPills) {
      const key = p.label.toLowerCase();
      if (placedLabels.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: p.id, label: p.label, source: "public", pill: p });
    }
    for (const label of BINGO_PRESETS) {
      const key = label.toLowerCase();
      if (placedLabels.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `preset:${label}`, label, source: "preset" });
    }
    return out;
  }, [pills, publicPills, placedLabels]);

  const filteredPills = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bySource =
      sourceFilters.size === 0
        ? availablePills
        : availablePills.filter((p) =>
            sourceFilters.has(p.source as "user" | "public" | "preset"),
          );
    if (!q) return bySource;
    return bySource.filter((p) => p.label.toLowerCase().includes(q));
  }, [availablePills, search, sourceFilters]);

  const sourceCounts = useMemo(() => {
    const acc = { user: 0, public: 0, preset: 0 };
    for (const p of availablePills) {
      if (p.source === "user") acc.user++;
      else if (p.source === "public") acc.public++;
      else if (p.source === "preset") acc.preset++;
    }
    return acc;
  }, [availablePills]);

  // Groupes affichés en sections distinctes dans le picker. `filteredPills`
  // inclut déjà le filtre par source + recherche, on n'a qu'à splitter.
  const groupedPills = useMemo(() => {
    const acc: Record<"user" | "public" | "preset", typeof filteredPills> = {
      user: [],
      public: [],
      preset: [],
    };
    for (const p of filteredPills) {
      acc[p.source as "user" | "public" | "preset"].push(p);
    }
    return acc;
  }, [filteredPills]);

  // Rendu d'une pill cliquable dans le picker. Factorisé pour être réutilisé
  // par les 3 sections (Personnel / Communautaire / Grimolia). Garde l'accès
  // aux closures (onPickPill, setPillActions, pillBtnRefs).
  const renderPickerPill = (p: (typeof filteredPills)[number]) => (
    <View
      key={p.id}
      className="self-start flex-row items-stretch overflow-hidden rounded-2xl bg-paper-warm"
    >
      <Pressable
        onPress={() => onPickPill(p.label)}
        className="flex-row items-center gap-1.5 px-4 py-2 active:opacity-80"
      >
        {p.source === "public" ? (
          <MaterialIcons name="public" size={14} color="#6b6259" />
        ) : null}
        {p.source === "user" &&
        p.pill &&
        p.pill.status !== "private" ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor:
                p.pill.status === "proposed"
                  ? "#f59e0b"
                  : p.pill.status === "public"
                    ? "#34d399"
                    : "#94a3b8",
            }}
          />
        ) : null}
        {p.source === "user" &&
        p.pill?.status === "private" &&
        p.pill.decisionReason ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#ef4444",
            }}
          />
        ) : null}
        <Text className="text-base text-ink">{p.label}</Text>
      </Pressable>
      {(p.source === "user" || p.source === "public") && (
        <>
          <View className="my-1 w-px bg-ink-muted/25" />
          <Pressable
            ref={(node) => {
              if (node)
                pillBtnRefs.current.set(p.id, node as unknown as View);
              else pillBtnRefs.current.delete(p.id);
            }}
            onPress={() => {
              const node = pillBtnRefs.current.get(p.id);
              if (!node) return;
              (node as unknown as View).measureInWindow((x, y, w, h) => {
                const MENU_W = 220;
                const left = Math.max(8, x + w - MENU_W);
                const top = y + h + 4;
                setPillActions({
                  id: p.id,
                  source: p.source as "user" | "public",
                  left,
                  top,
                });
              });
            }}
            accessibilityLabel="Actions du défi"
            className="px-3 active:opacity-60 items-center justify-center"
          >
            <MaterialIcons name="more-horiz" size={18} color="#6b6259" />
          </Pressable>
        </>
      )}
    </View>
  );

  function toggleSource(s: "user" | "public" | "preset") {
    setSourceFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const exactMatchExists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return false;
    return (
      availablePills.some((p) => p.label.toLowerCase() === q) ||
      placedLabels.has(q)
    );
  }, [availablePills, placedLabels, search]);

  // Métadonnées du défi actuellement placé sur la cellule en cours de
  // modification (targetCell). On match par label (les BingoItem n'ont pas
  // de pill_id direct). Source : own pill > publicPill (autre user) >
  // preset (sans métadonnée).
  const currentCellPill = useMemo(() => {
    if (targetCell == null) return null;
    const item = items.find((it) => it.position === targetCell);
    if (!item) return null;
    const key = item.label.toLowerCase();
    const own = pills.find((p) => p.label.toLowerCase() === key);
    if (own) return { label: item.label, source: "user" as const, pill: own };
    const pub = publicPills.find((p) => p.label.toLowerCase() === key);
    if (pub) return { label: item.label, source: "public" as const, pill: pub };
    return { label: item.label, source: "preset" as const, pill: null };
  }, [items, pills, publicPills, targetCell]);

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
    setSearch("");
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
      return;
    }
    const pill = onAddPill(text);
    if (!pill) return;
    applyPickedLabel(pill.label);
    // Pour une pill toute fraîche (status par défaut = 'private', jamais
    // soumise), on ouvre la modale de proposition admin. Si elle existait
    // déjà (cas dédoublonnage par addPill ↑), on ne propose pas — l'user a
    // déjà accès à l'option via le menu kebab.
    if (pill.status === "private" && pill.decisionReason === null) {
      setProposeModalPillId(pill.id);
    }
  };

  const onClosePicker = () => {
    setPickerOpen(false);
    setSearch("");
    setTargetCell(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerClassName="px-4 pt-4 pb-32"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              className="p-1 active:opacity-60"
            >
              <MaterialIcons name="arrow-back" size={24} color={theme.ink} />
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
                className="p-1 active:opacity-60"
              >
                <MaterialIcons name="palette" size={22} color={theme.ink} />
              </Pressable>
              <Pressable
                onPress={onUndo}
                disabled={undoStack.length === 0}
                hitSlop={10}
                accessibilityLabel="Annuler"
                style={{ opacity: undoStack.length === 0 ? 0.3 : 1 }}
                className="p-1 active:opacity-60"
              >
                <MaterialIcons name="undo" size={22} color={theme.ink} />
              </Pressable>
              <Pressable
                onPress={onRedo}
                disabled={redoStack.length === 0}
                hitSlop={10}
                accessibilityLabel="Rétablir"
                style={{ opacity: redoStack.length === 0 ? 0.3 : 1 }}
                className="p-1 active:opacity-60"
              >
                <MaterialIcons name="redo" size={22} color={theme.ink} />
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={items.length < BINGO_CELLS}
                accessibilityLabel={
                  alreadySaved ? "Valider la grille" : "Lancer le jeu"
                }
                className="rounded-full bg-accent px-4 py-2 active:opacity-80"
                style={{ opacity: items.length < BINGO_CELLS ? 0.4 : 1 }}
              >
                <Text className="font-sans-med text-paper">
                  {alreadySaved ? "Valider ✅" : "Lancer 🚀"}
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
              Tape sur une case pour choisir un défi. Appui long pour réarranger
              les cases.
            </Text>
          </Animated.View>

          <GestureDetector gesture={panGesture}>
            <View
              ref={gridRef}
              collapsable={false}
              className="mt-4"
              onLayout={remeasureGrid}
            >
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
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: insets.bottom + 16,
        }}
        className="flex-row items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 active:opacity-80"
      >
        <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
        <Text className="font-sans-med text-red-600">Supprimer le bingo</Text>
      </Pressable>

      {dragLabel && dragSize && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              width: dragSize.width,
              height: dragSize.height,
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowOffset: { width: 0, height: 6 },
              shadowRadius: 12,
              elevation: 8,
            },
            ghostStyle,
          ]}
        >
          <View
            style={{ flex: 1, padding: 4, borderRadius: 8, borderWidth: 2 }}
            className="items-center justify-center border-accent bg-paper"
          >
            <Text
              numberOfLines={4}
              adjustsFontSizeToFit
              className="text-center text-xs text-ink"
            >
              {dragLabel}
            </Text>
          </View>
        </Animated.View>
      )}

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={onClosePicker}
      >
        <Pressable className="flex-1 bg-black/30" onPress={onClosePicker} />
        <View
          className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper pt-3"
          style={{ height: "70%" }}
        >
          <View className="items-center pb-2">
            <View className="h-1 w-12 rounded-full bg-ink-muted/30" />
          </View>
          <CurrentCellBanner
            cell={currentCellPill}
            onClosePicker={() => setPickerOpen(false)}
          />
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
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  hitSlop={10}
                  className="p-1 active:opacity-60"
                >
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
              className="rounded-full bg-accent p-3 active:opacity-80"
            >
              <MaterialIcons name="add" size={20} color="white" />
            </Pressable>
          </View>
          <View
            className="flex-row flex-wrap items-center gap-2 px-4 pt-3"
          >
            <SourceFilterPill
              label="Personnel"
              icon="person"
              count={sourceCounts.user}
              active={sourceFilters.has("user")}
              onToggle={() => toggleSource("user")}
            />
            <SourceFilterPill
              label="Communautaire"
              icon="public"
              count={sourceCounts.public}
              active={sourceFilters.has("public")}
              onToggle={() => toggleSource("public")}
            />
            <SourceFilterPill
              label="Grimolia"
              icon="auto-awesome"
              count={sourceCounts.preset}
              active={sourceFilters.has("preset")}
              onToggle={() => toggleSource("preset")}
            />
          </View>
          <ScrollView
            contentContainerClassName="px-4 py-4"
            keyboardShouldPersistTaps="handled"
          >
            {groupedPills.user.length > 0 ? (
              <PillSection
                title="Personnel"
                icon="person"
                count={groupedPills.user.length}
              >
                {groupedPills.user.map((p) => renderPickerPill(p))}
              </PillSection>
            ) : null}
            {groupedPills.public.length > 0 ? (
              <PillSection
                title="Communautaire"
                icon="public"
                count={groupedPills.public.length}
              >
                {groupedPills.public.map((p) => renderPickerPill(p))}
              </PillSection>
            ) : null}
            {groupedPills.preset.length > 0 ? (
              <PillSection
                title="Grimolia"
                icon="auto-awesome"
                count={groupedPills.preset.length}
              >
                {groupedPills.preset.map((p) => renderPickerPill(p))}
              </PillSection>
            ) : null}
            {filteredPills.length === 0 && (
              <Text className="px-2 py-8 text-center text-ink-muted">
                {!search.trim()
                  ? "Tous les défis sont placés."
                  : exactMatchExists
                    ? `« ${search.trim()} » est déjà placé sur la grille.`
                    : `Aucun défi. Tape « + » pour créer « ${search.trim()} ».`}
              </Text>
            )}
          </ScrollView>
        </View>

        {pillActions !== null &&
          pillActions.source === "public" &&
          (() => {
            // Pill publique d'un autre user : menu read-only (auteur cliquable
            // qui pousse vers /profile/[userId], + message admin si présent).
            const p = publicPills.find((x) => x.id === pillActions.id);
            if (!p) return null;
            return (
              <Pressable
                onPress={() => setPillActions(null)}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: pillActions.top,
                    left: pillActions.left,
                    width: 280,
                    shadowColor: "#000",
                    shadowOpacity: 0.18,
                    shadowOffset: { width: 0, height: 6 },
                    shadowRadius: 12,
                    elevation: 8,
                  }}
                  className="rounded-2xl border border-ink-muted/15 bg-paper p-3"
                >
                  <Text className="text-xs uppercase font-sans-med text-ink-muted mb-2">
                    Auteur
                  </Text>
                  <UserCard
                    userId={p.userId}
                    variant="compact"
                    size="sm"
                    showHandle
                    showChevron
                    onPress={() => {
                      setPillActions(null);
                      setPickerOpen(false);
                      router.push(`/profile/${p.userId}`);
                    }}
                  />
                  {p.decisionReason ? (
                    <View className="mt-3 rounded-xl bg-paper-warm px-3 py-2">
                      <Text className="text-[10px] uppercase font-sans-med text-ink-muted">
                        Le mot de l'équipe Grimolia
                      </Text>
                      <Text className="mt-1 text-xs text-ink">
                        {p.decisionReason}
                      </Text>
                    </View>
                  ) : null}
                  <View className="mt-3 flex-row items-center gap-1.5">
                    <MaterialIcons name="public" size={14} color="#6b6259" />
                    <Text className="text-[11px] text-ink-muted">
                      Défi communautaire approuvé
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })()}

        {pillActions !== null &&
          pillActions.source === "user" &&
          (() => {
            const p = pills.find((x) => x.id === pillActions.id);
            const status = p?.status ?? "private";
            const hasReason = (p?.decisionReason ?? null) !== null;
            // Mapping action → label/icône selon le statut, parité avec
            // `BingoPillForm` côté admin (cf. 0060). public/disabled = lecture
            // seule ; private/proposed → ouvrent la modale propose.
            const moderationAction =
              status === "private" && !hasReason
                ? {
                    label: "Proposer aux admins",
                    icon: "send" as const,
                    kind: "open" as const,
                  }
                : status === "private" && hasReason
                  ? {
                      label: "Voir le refus · Re-proposer",
                      icon: "replay" as const,
                      kind: "open" as const,
                    }
                  : status === "proposed"
                    ? {
                        label: "Demande de publication",
                        icon: "hourglass-empty" as const,
                        kind: "open" as const,
                      }
                    : status === "public"
                      ? {
                          label: "Publié",
                          icon: "check-circle" as const,
                          kind: "info" as const,
                        }
                      : {
                          label: "Désactivé par admin",
                          icon: "block" as const,
                          kind: "info" as const,
                        };
            return (
              <Pressable
                onPress={() => setPillActions(null)}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: pillActions.top,
                    left: pillActions.left,
                    width: 220,
                    shadowColor: "#000",
                    shadowOpacity: 0.18,
                    shadowOffset: { width: 0, height: 6 },
                    shadowRadius: 12,
                    elevation: 8,
                  }}
                  className="rounded-2xl border border-ink-muted/15 bg-paper p-1"
                >
                  {status !== 'public' ? (
                    <Pressable
                      onPress={() => {
                        if (p) setEditingPill({ id: p.id, label: p.label });
                        setPillActions(null);
                      }}
                      className="flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-paper-warm"
                    >
                      <MaterialIcons name="edit" size={18} color="#1f1a16" />
                      <Text className="font-sans-med text-ink">Éditer</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    disabled={moderationAction.kind === "info"}
                    onPress={() => {
                      if (moderationAction.kind === "open" && p) {
                        // Fermer le picker AVANT d'ouvrir la modale propose :
                        // 2 RN Modal frères se bloquent mutuellement si
                        // simultanées (le 2e overlay capture les events sans
                        // s'afficher).
                        setPickerOpen(false);
                        setProposeModalPillId(p.id);
                      }
                      setPillActions(null);
                    }}
                    className="flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-paper-warm"
                    style={{
                      opacity: moderationAction.kind === "info" ? 0.6 : 1,
                    }}
                  >
                    <MaterialIcons
                      name={moderationAction.icon}
                      size={18}
                      color="#1f1a16"
                    />
                    <Text className="font-sans-med text-ink" numberOfLines={1}>
                      {moderationAction.label}
                    </Text>
                  </Pressable>

                  {hasReason && p?.decisionReason ? (
                    <View className="px-3 py-2">
                      <Text className="text-xs text-ink-muted">
                        Message admin :
                      </Text>
                      <Text className="text-xs text-ink" numberOfLines={3}>
                        {p.decisionReason}
                      </Text>
                    </View>
                  ) : null}

                  {status === 'public' ? (
                    <View className="rounded-xl bg-paper-warm px-3 py-2">
                      <Text className="text-xs text-ink-muted">
                        Édition et suppression désactivées : ce défi est
                        publié et utilisé par la communauté.
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={async () => {
                        const targetId = pillActions.id;
                        setPillActions(null);
                        try {
                          await onRemovePill(targetId);
                        } catch {
                          // RPC raise (pill devenue `public` côté DB). Le
                          // store a déjà refetch la row, ce qui remet le
                          // bon statut localement — pas la peine de polluer
                          // l'alerte avec un message technique ou un
                          // rappel sur le refresh.
                          Alert.alert('Impossible de supprimer ce défi');
                        }
                      }}
                      className="flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-red-500/10"
                    >
                      <MaterialIcons
                        name="delete-outline"
                        size={18}
                        color="#dc2626"
                      />
                      <Text className="font-sans-med text-red-600">Retirer</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          })()}

        {editingPill !== null && (
          <Pressable
            onPress={() => setEditingPill(null)}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              justifyContent: "center",
              paddingHorizontal: 24,
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="rounded-3xl bg-paper p-5"
            >
              <Text className="font-display text-xl text-ink">
                Éditer le défi
              </Text>
              <View className="mt-4 rounded-2xl bg-paper-warm px-4 py-3">
                <TextInput
                  value={editingPill?.label ?? ""}
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
                  className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
                >
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
                  className="flex-1 rounded-full bg-accent py-3 active:opacity-80"
                >
                  <Text className="text-center font-sans-med text-paper">
                    Enregistrer
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        )}
      </Modal>

      {/* La modale propose est rendue en frère du picker (top-level
          SafeAreaView). Les deux RN Modal cohabitent mal : l'overlay de la
          2e bloque les inputs si elles sont visibles simultanément. La règle
          : avant d'ouvrir la modale propose, fermer le picker (cf. handlers
          dans pillActions et onAddCustom). */}
      <ProposeBingoPillModal
        pillId={proposeModalPillId}
        onClose={() => setProposeModalPillId(null)}
      />
    </SafeAreaView>
  );
}

// ─── Section de défis (groupement par source) ────────────────────────

function PillSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center gap-1.5">
        <MaterialIcons name={icon} size={13} color="#6b6259" />
        <Text className="text-[11px] uppercase font-sans-med text-ink-muted">
          {title}
        </Text>
        <View
          className="rounded-full bg-ink-muted/15 px-1.5"
          style={{ minWidth: 18 }}
        >
          <Text className="text-[10px] font-sans-med text-center text-ink-muted">
            {count}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

// ─── Pill de filtre par source ────────────────────────────────────────
// Multi-select sur la barre au-dessus de la liste : aucune active = on
// affiche tout, sinon on n'affiche que les sources cochées.

function SourceFilterPill({
  label,
  icon,
  count,
  active,
  onToggle,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      className="flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 active:opacity-70"
      style={{
        borderColor: active ? "#1f1a16" : "#d9cfc3",
        backgroundColor: active ? "#1f1a16" : "transparent",
      }}
    >
      <MaterialIcons name={icon} size={13} color={active ? "white" : "#6b6259"} />
      <Text
        className="text-xs font-sans-med"
        style={{ color: active ? "white" : "#1f1a16" }}
      >
        {label}
      </Text>
      <View
        className="rounded-full px-1.5"
        style={{
          backgroundColor: active ? "rgba(255,255,255,0.2)" : "#e8ddd0",
          minWidth: 18,
        }}
      >
        <Text
          className="text-[10px] font-sans-med text-center"
          style={{ color: active ? "white" : "#6b6259" }}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Bandeau "défi actuel" du picker ─────────────────────────────────
// Cellule vide → message neutre. Cellule remplie : label + status si pill
// perso, ou auteur cliquable + retour admin si pill publique d'autre user.

const PILL_STATUS_DOT: Record<BingoPill["status"], string> = {
  private: "#94a3b8",
  proposed: "#f59e0b",
  public: "#34d399",
  disabled: "#ef4444",
};

const PILL_STATUS_LABELS: Record<BingoPill["status"], string> = {
  private: "Privé",
  proposed: "En attente d'admin",
  public: "Publié",
  disabled: "Désactivé",
};

function CurrentCellBanner({
  cell,
  onClosePicker,
}: {
  cell:
    | { label: string; source: "user"; pill: BingoPill }
    | { label: string; source: "public"; pill: BingoPill }
    | { label: string; source: "preset"; pill: null }
    | null;
  onClosePicker: () => void;
}) {
  const router = useRouter();
  const navProfile = (userId: string) => {
    onClosePicker();
    router.push(`/profile/${userId}`);
  };

  if (!cell) {
    return (
      <View className="mx-4 mb-2 rounded-2xl border border-dashed border-ink-muted/30 px-3 py-2">
        <Text className="text-[10px] uppercase font-sans-med text-ink-muted">
          Défi actuel
        </Text>
        <Text className="mt-0.5 text-sm italic text-ink-muted">
          Cellule vide
        </Text>
      </View>
    );
  }

  // Cas "rien de plus que le texte" : pill perso sans cycle de modération
  // (private + jamais soumise) ou preset. On garde un bandeau minimal.
  const isBareText =
    cell.source === "preset" ||
    (cell.source === "user" &&
      cell.pill.status === "private" &&
      cell.pill.decisionReason === null);

  if (isBareText) {
    return (
      <View className="mx-4 mb-2 rounded-2xl bg-paper-warm px-3 py-2">
        <Text className="text-[10px] uppercase font-sans-med text-ink-muted">
          Défi actuel
        </Text>
        <Text
          className="mt-1 text-base font-sans-med text-ink"
          numberOfLines={2}
        >
          {cell.label}
        </Text>
      </View>
    );
  }

  // Sinon : on a un cycle de publication à montrer (pill perso non-private
  // ou refusée, OU pill publique d'un autre user). Affichage : status →
  // label → auteur cliquable → message admin.
  const pill = cell.pill!;
  const isCommunity = cell.source === "public";

  return (
    <View className="mx-4 mb-2 rounded-2xl bg-paper-warm px-3 py-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] uppercase font-sans-med text-ink-muted">
          Défi actuel
        </Text>
        {isCommunity ? (
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="public" size={12} color="#6b6259" />
            <Text className="text-[10px] text-ink-muted">Communautaire</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-1 text-base font-sans-med text-ink" numberOfLines={2}>
        {cell.label}
      </Text>

      <View className="mt-1.5 flex-row items-center gap-1.5">
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: PILL_STATUS_DOT[pill.status],
          }}
        />
        <Text className="text-[11px] text-ink-muted">
          {PILL_STATUS_LABELS[pill.status]}
        </Text>
        {pill.status === "private" && pill.decisionReason ? (
          <Text className="text-[11px] text-red-600">· refusé</Text>
        ) : null}
      </View>

      <View className="mt-2">
        <Text className="text-[10px] uppercase font-sans-med text-ink-muted mb-1">
          Auteur
        </Text>
        <UserCard
          userId={pill.userId}
          variant="compact"
          size="sm"
          showHandle
          showChevron
          onPress={() => navProfile(pill.userId)}
        />
      </View>

      {pill.decisionReason ? (
        <View className="mt-2 rounded-xl bg-paper px-2 py-1.5">
          <Text className="text-[10px] uppercase font-sans-med text-ink-muted">
            Le mot de l'équipe Grimolia
          </Text>
          <Text className="text-[11px] text-ink" numberOfLines={3}>
            {pill.decisionReason}
          </Text>
        </View>
      ) : null}
    </View>
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

  const findCellAt = useCallback(
    (absX: number, absY: number): number | null => {
      const lx = absX - gridOriginRef.current.x;
      const ly = absY - gridOriginRef.current.y;
      for (const [idx, l] of cellLayoutsRef.current) {
        if (
          lx >= l.x &&
          lx <= l.x + l.width &&
          ly >= l.y &&
          ly <= l.y + l.height
        ) {
          return idx;
        }
      }
      return null;
    },
    [],
  );

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
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <BookCover
          isbn={ub.book.isbn}
          coverUrl={ub.book.coverUrl}
          contentFit="cover"
          style={{ width: "100%", height: "100%", opacity: 0.5 }}
        />
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="px-4 pt-4 pb-16">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            className="p-1 active:opacity-60"
          >
            <MaterialIcons name="arrow-back" size={24} color={theme.ink} />
          </Pressable>
          <View className="flex-row items-center gap-3">
            {!archived && (
              <Pressable
                onPress={() => setCustomizerOpen(true)}
                hitSlop={10}
                accessibilityLabel="Personnaliser"
                className="p-1 active:opacity-60"
              >
                <MaterialIcons name="palette" size={22} color={theme.ink} />
              </Pressable>
            )}
            {canEditItems && !archived && (
              <Pressable
                onPress={onEditItems}
                hitSlop={10}
                accessibilityLabel="Modifier la grille"
                className="p-1 active:opacity-60"
              >
                <MaterialIcons name="edit" size={22} color={theme.ink} />
              </Pressable>
            )}
            <Pressable
              onPress={() => setShowMenu(true)}
              hitSlop={10}
              className="p-1 active:opacity-60"
            >
              <MaterialIcons name="more-vert" size={24} color={theme.ink} />
            </Pressable>
          </View>
        </View>

        <Animated.View entering={FadeInDown.duration(300)}>
          <Text className="mt-2 font-display text-3xl text-ink">{title}</Text>
          <Text className="mt-1 text-sm text-ink-muted">
            {placedCells.size}/{BINGO_CELLS} livres placés
            {winLines.length > 0 &&
              ` • ${winLines.length} ligne${
                winLines.length > 1 ? "s" : ""
              } complétée${winLines.length > 1 ? "s" : ""}`}
            {archived && " • Archivé"}
          </Text>
        </Animated.View>

        <View
          className="mt-4"
          ref={gridRef}
          collapsable={false}
          onLayout={remeasureGrid}
        >
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
            <Text className="font-display text-lg text-ink">
              Ma bibliothèque
            </Text>
            <Text className="mt-1 text-xs text-ink-muted">
              {selectedBookId
                ? "Tape une case pour y placer le livre sélectionné."
                : "Tape un livre puis une case, ou maintiens-le pour le glisser."}
            </Text>
            {books.length === 0 ? (
              <Text className="mt-3 text-ink-muted">
                Ajoute d&apos;abord des livres à ta bibliothèque pour les
                placer.
              </Text>
            ) : (
              <View className="mt-3 flex-row flex-wrap gap-3">
                {books.map((ub) => {
                  const isPlaced = [...completionsByCell.values()].includes(
                    ub.id,
                  );
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
                  className="flex-row items-center gap-3 rounded-2xl bg-paper-warm p-3 active:opacity-80"
                >
                  <BookCover
                    isbn={ub.book.isbn}
                    coverUrl={ub.book.coverUrl}
                    style={{ width: 36, height: 54, borderRadius: 4 }}
                  />
                  <View className="flex-1">
                    <View
                      style={{ backgroundColor: "#e5e1da" }}
                      className="self-start rounded-full px-2 py-0.5"
                    >
                      <Text
                        numberOfLines={1}
                        className="text-xs font-sans-bold text-ink"
                      >
                        {item.label}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      className="mt-1 font-sans-med text-ink"
                    >
                      {ub.book.title}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: READING_STATUS_META[ub.status].color,
                    }}
                    className="rounded-full px-2 py-0.5"
                  >
                    <Text className="text-[11px] font-sans-med text-paper">
                      {READING_STATUS_META[ub.status].label}
                    </Text>
                  </View>
                  {!archived && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        onRemoveCell(cellIndex);
                      }}
                      hitSlop={8}
                      className="p-1 active:opacity-60"
                    >
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
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable
          onPress={() => setShowMenu(false)}
          className="flex-1 items-end bg-ink/40 px-4 pt-14"
        >
          <View className="w-56 rounded-2xl bg-paper p-2">
            {canEditItems && !archived && (
              <Pressable
                onPress={() => {
                  setShowMenu(false);
                  onEditItems();
                }}
                className="flex-row items-center gap-2 rounded-xl px-3 py-3 active:bg-paper-warm"
              >
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
                className="flex-row items-center gap-2 rounded-xl px-3 py-3 active:bg-paper-warm"
              >
                <MaterialIcons name="archive" size={18} color="#1f1a16" />
                <Text className="text-ink">Archiver</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setShowMenu(false);
                onDelete();
              }}
              className="flex-row items-center gap-2 rounded-xl px-3 py-3 active:bg-paper-warm"
            >
              <MaterialIcons name="delete-outline" size={18} color="#b8503a" />
              <Text style={{ color: "#b8503a" }}>Supprimer</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={showWin}
        animationType="fade"
        onRequestClose={() => setShowWin(false)}
      >
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
                className="rounded-full bg-accent py-3 active:opacity-80"
              >
                <Text className="text-center font-sans-med text-paper">
                  Nouveau bingo
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowWin(false)}
                className="rounded-full border border-ink-muted/30 py-3 active:opacity-70"
              >
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
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 10,
          },
        ]}
        className="items-center"
      >
        <View
          style={{
            opacity: isPlaced ? 0.45 : 1,
            borderWidth: isSelected ? 3 : 0,
            borderColor: "#c27b52",
            borderRadius: 8,
            padding: isSelected ? 1 : 0,
          }}
        >
          <BookCover
            isbn={ub.book.isbn}
            coverUrl={ub.book.coverUrl}
            style={{ width: 70, height: 100, borderRadius: 6 }}
          />
        </View>
        <Text
          numberOfLines={2}
          className="mt-1 text-center text-[11px] text-ink"
        >
          {ub.book.title}
        </Text>
        {isPlaced && (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: "#5fa84d",
            }}
            className="items-center justify-center"
          >
            <MaterialIcons name="check" size={12} color="white" />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
