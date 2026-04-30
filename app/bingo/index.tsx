import { BingoGrid } from "@/components/bingo-grid";
import { pickInitialPresetLabels } from "@/lib/bingo-presets";
import { countCompletedLines } from "@/lib/bingo-win";
import { newId } from "@/lib/id";
import { useBingos } from "@/store/bingo";
import { useBookshelf } from "@/store/bookshelf";
import type { Bingo, BingoCompletion, BingoItem } from "@/types/bingo";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const EMPTY_COMPLETIONS: BingoCompletion[] = [];

function makePresetItems(): BingoItem[] {
  return pickInitialPresetLabels().map((label, i) => ({
    id: newId(),
    label,
    position: i,
  }));
}

export default function BingoListScreen() {
  const router = useRouter();
  const bingos = useBingos((s) => s.bingos);
  const createBingo = useBingos((s) => s.createBingo);

  const { active, archived } = useMemo(() => {
    const a: Bingo[] = [];
    const ar: Bingo[] = [];
    for (const b of bingos) {
      if (b.archivedAt) ar.push(b);
      else a.push(b);
    }
    // Archivés du plus récent au plus ancien
    ar.sort((x, y) => (y.archivedAt ?? "").localeCompare(x.archivedAt ?? ""));
    return { active: a, archived: ar };
  }, [bingos]);

  const onNew = () => {
    const bingo = createBingo("Nouveau bingo", makePresetItems());
    if (bingo) router.push(`/bingo/${bingo.id}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-32">
        <Animated.View entering={FadeInDown.duration(400)}>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              className="-ml-1 p-1 active:opacity-60"
            >
              <MaterialIcons name="arrow-back" size={28} color="#1f1a16" />
            </Pressable>
            <Text className="font-display text-4xl text-ink">Mes bingos</Text>
          </View>
          <Text className="mt-1 text-base text-ink-muted">
            Crée des grilles et remplis-les avec tes lectures.
          </Text>
        </Animated.View>

        {active.length === 0 ? (
          <Animated.View
            entering={FadeIn.duration(450).delay(100)}
            className="mt-8 overflow-hidden rounded-3xl bg-accent-pale p-6"
          >
            <View className="items-center">
              <View
                className="h-16 w-16 items-center justify-center rounded-2xl bg-accent"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <MaterialIcons name="grid-view" size={32} color="white" />
              </View>
              <Text className="mt-4 text-center font-display text-2xl text-ink">
                Lance ton premier bingo
              </Text>
              <Text className="mt-2 text-center text-ink-muted">
                Choisis 25 défis, place tes lectures sur la grille et complète
                une ligne pour gagner.
              </Text>
              <Pressable
                onPress={onNew}
                className="mt-5 flex-row items-center gap-2 rounded-full bg-accent px-6 py-3 active:opacity-80"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <MaterialIcons name="add" size={20} color="white" />
                <Text className="font-sans-med text-paper">
                  Créer une grille
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : (
          <View className="mt-6 gap-4">
            {active.map((b, i) => (
              <BingoRow
                key={b.id}
                bingo={b}
                delay={i * 40}
                onPress={() => router.push(`/bingo/${b.id}`)}
              />
            ))}
          </View>
        )}

        {archived.length > 0 && (
          <View className="mt-10">
            <Text className="font-display text-2xl text-ink">
              Mes anciens bingos
            </Text>
            <View className="mt-4 gap-4">
              {archived.map((b, i) => (
                <BingoRow
                  key={b.id}
                  bingo={b}
                  delay={i * 40}
                  onPress={() => router.push(`/bingo/${b.id}`)}
                  archived
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={onNew}
        accessibilityLabel="Nouveau bingo"
        style={{
          position: "absolute",
          right: 24,
          bottom: 24,
          width: 60,
          height: 60,
          borderRadius: 30,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 8,
          elevation: 4,
        }}
        className="items-center justify-center bg-accent active:opacity-80"
      >
        <MaterialIcons name="add" size={32} color="white" />
      </Pressable>
    </SafeAreaView>
  );
}

function BingoRow({
  bingo,
  delay,
  onPress,
  archived,
}: {
  bingo: Bingo;
  delay: number;
  onPress: () => void;
  archived?: boolean;
}) {
  const completions =
    useBingos((s) => s.completions[bingo.id]) ?? EMPTY_COMPLETIONS;
  const books = useBookshelf((s) => s.books);
  const deleteBingo = useBingos((s) => s.deleteBingo);
  const archiveBingo = useBingos((s) => s.archiveBingo);

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

  const lines = countCompletedLines(readCells);

  const confirmDelete = () => {
    Alert.alert("Supprimer ce bingo ?", "Action irréversible.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () => deleteBingo(bingo.id),
      },
    ]);
  };

  const confirmArchive = () => {
    Alert.alert(
      "Archiver ce bingo ?",
      "Il rejoindra la section « Mes anciens bingos ».",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Archiver", onPress: () => archiveBingo(bingo.id) },
      ],
    );
  };

  return (
    <Animated.View entering={FadeIn.duration(300).delay(delay)}>
      <Swipeable
        renderRightActions={() => <DeleteAction onPress={confirmDelete} />}
        renderLeftActions={
          archived
            ? undefined
            : () => <ArchiveAction onPress={confirmArchive} />
        }
        overshootRight={false}
        overshootLeft={false}
        rightThreshold={48}
        leftThreshold={48}
      >
        <Pressable
          onPress={onPress}
          className="rounded-3xl bg-paper-warm p-4 active:opacity-80"
          style={{ opacity: archived ? 0.75 : 1 }}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text
                  className="font-display text-xl text-ink"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {bingo.title}
                </Text>
                {!archived && !bingo.savedAt && (
                  <View className="flex-row items-center gap-1 rounded-full bg-accent-pale px-2 py-0.5">
                    <MaterialIcons name="edit-note" size={14} color="#1f1a16" />
                    <Text className="text-xs font-sans-med text-ink">
                      Brouillon
                    </Text>
                  </View>
                )}
              </View>
              <Text className="mt-1 text-sm text-ink-muted">
                {placedCells.size}/25 livres placés
                {lines > 0 &&
                  ` • ${lines} ligne${lines > 1 ? "s" : ""} complétée${
                    lines > 1 ? "s" : ""
                  }`}
              </Text>
              {archived && (
                <Text className="mt-1 text-xs uppercase tracking-wider text-ink-muted">
                  Archivé
                </Text>
              )}
            </View>
            <View style={{ width: 120 }}>
              <BingoGrid
                items={bingo.items}
                completedCells={placedCells}
                readCells={readCells}
                appearance={bingo.appearance}
              />
            </View>
          </View>
        </Pressable>
      </Swipeable>
    </Animated.View>
  );
}

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Supprimer le bingo"
      style={{ backgroundColor: "#b8503a" }}
      className="my-1 ml-2 items-center justify-center rounded-2xl px-5 active:opacity-80"
    >
      <MaterialIcons name="delete-outline" size={24} color="#fbf8f4" />
      <Text className="mt-1 text-xs font-sans-med text-paper">Supprimer</Text>
    </Pressable>
  );
}

function ArchiveAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Archiver le bingo"
      style={{ backgroundColor: "#6b6259" }}
      className="my-1 mr-2 items-center justify-center rounded-2xl px-5 active:opacity-80"
    >
      <MaterialIcons name="archive" size={24} color="#fbf8f4" />
      <Text className="mt-1 text-xs font-sans-med text-paper">Archiver</Text>
    </Pressable>
  );
}
