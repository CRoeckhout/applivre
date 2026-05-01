import { BingoGrid } from "@/components/bingo-grid";
import { useCardFrame } from "@/components/card-frame-context";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { pickInitialPresetLabels } from "@/lib/bingo-presets";
import { countCompletedLines } from "@/lib/bingo-win";
import { newId } from "@/lib/id";
import { makeFondTokenOverrides } from "@/lib/sheet-appearance";
import { useBingos } from "@/store/bingo";
import { useBookshelf } from "@/store/bookshelf";
import type { Bingo, BingoItem } from "@/types/bingo";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

export function BingoCard() {
  const router = useRouter();
  const bingos = useBingos((s) => s.bingos);
  const completions = useBingos((s) => s.completions);
  const books = useBookshelf((s) => s.books);
  const createBingo = useBingos((s) => s.createBingo);
  const { inFrame, padding: framedPadding } = useCardFrame();
  // Cf. shortcut-card : padding natif quand pas de cadre.
  const useNaturalPadding = framedPadding === undefined;
  // La grille preview est posée dans la card BingoCard de la home (wrapper
  // `bg-paper-warm` quand pas de cadre catalog). On remappe les tokens fond
  // du cadre SVG snapshoté vers cette couleur d'environnement — sinon le cadre
  // se fond avec son propre `appearance.bgColor` qui peut différer du wrapper.
  const theme = useThemeColors();
  const previewTokenOverrides = useMemo(
    () => makeFondTokenOverrides(theme.paperWarm),
    [theme.paperWarm],
  );

  const active = useMemo(() => bingos.filter((b) => !b.archivedAt), [bingos]);

  const stats = useMemo(() => {
    let linesDone = 0;
    let mostFilled: Bingo | undefined;
    let mostFilledPlaced = -1;
    let mostFilledReadCells = new Set<number>();
    let mostFilledPlacedCells = new Set<number>();
    for (const b of active) {
      const list = completions[b.id] ?? [];
      const readCells = new Set<number>();
      const placedCells = new Set<number>();
      for (const c of list) {
        placedCells.add(c.cellIndex);
        const ub = books.find((x) => x.id === c.userBookId);
        if (ub?.status === "read") readCells.add(c.cellIndex);
      }
      linesDone += countCompletedLines(readCells);
      if (placedCells.size > mostFilledPlaced) {
        mostFilledPlaced = placedCells.size;
        mostFilled = b;
        mostFilledReadCells = readCells;
        mostFilledPlacedCells = placedCells;
      }
    }
    return {
      count: active.length,
      linesDone,
      mostFilled,
      mostFilledReadCells,
      mostFilledPlacedCells,
    };
  }, [active, completions, books]);

  if (stats.count === 0) {
    const onCreate = () => {
      const items: BingoItem[] = pickInitialPresetLabels().map((label, i) => ({
        id: newId(),
        label,
        position: i,
      }));
      const bingo = createBingo("Nouveau bingo", items);
      if (bingo) router.push(`/bingo/${bingo.id}?edit=1`);
    };
    return (
      <Animated.View
        entering={FadeIn.duration(400)}
        className="overflow-hidden rounded-3xl bg-accent-pale p-6"
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
            Choisis 25 défis, place tes lectures sur la grille et complète une
            ligne pour gagner.
          </Text>
          <Pressable
            onPress={onCreate}
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
            <Text className="font-sans-med text-paper">Créer une grille</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push("/bingo")}
      className="active:opacity-90"
    >
      <Animated.View
        entering={FadeIn.duration(400)}
        className={`rounded-3xl ${useNaturalPadding ? 'p-6' : ''} ${inFrame ? '' : 'bg-paper-warm'}`}
        style={!useNaturalPadding ? { padding: framedPadding } : undefined}
      >
        <View className="flex-row items-baseline justify-between">
          <Text className="font-display text-xl text-ink">Bingo</Text>
          <Text className="text-xs uppercase tracking-wider text-ink-muted">
            ouvrir
          </Text>
        </View>

        <View className="mt-3 flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <View className="flex-row items-baseline gap-2">
              <Text
                className="font-display text-5xl text-ink"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {stats.count}
              </Text>
              <Text className="text-xl text-ink-soft">
                grille{stats.count > 1 ? "s" : ""} en cours
              </Text>
            </View>
            {stats.linesDone > 0 && (
              <Text className="mt-2 text-sm text-accent-deep">
                {stats.linesDone} ligne{stats.linesDone > 1 ? "s" : ""}{" "}
                complétée
                {stats.linesDone > 1 ? "s" : ""}
              </Text>
            )}
          </View>
          {stats.mostFilled && (
            <View style={{ width: 120 }}>
              <BingoGrid
                items={stats.mostFilled.items}
                completedCells={stats.mostFilledPlacedCells}
                readCells={stats.mostFilledReadCells}
                appearance={stats.mostFilled.appearance}
                tokenOverrides={previewTokenOverrides}
              />
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}
