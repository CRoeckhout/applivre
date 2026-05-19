import { HomeFab } from "@/components/home-fab";
import { SheetCard } from "@/components/sheet-card";
import {
  DEFAULT_SHEET_FILTERS,
  SheetSearchDrawer,
  type SheetSearchDrawerValue,
} from "@/components/sheet/sheet-search-drawer";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { isCustomAppearance, mergeAppearance } from "@/lib/sheet-appearance";
import { supabase } from "@/lib/supabase";
import { useBookshelf } from "@/store/bookshelf";
import { useReadingSheets } from "@/store/reading-sheets";
import { useSheetTemplates } from "@/store/sheet-templates";
import type { ReadingSheet, UserBook } from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type Entry = { sheet: ReadingSheet; userBook: UserBook };

export default function SheetsScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const sheets = useReadingSheets((s) => s.sheets);
  const removeSheet = useReadingSheets((s) => s.removeSheet);
  const books = useBookshelf((s) => s.books);

  const confirmDelete = (entry: Entry) => {
    Alert.alert(
      "Supprimer la fiche ?",
      `« ${entry.userBook.book.title} » — les sections et les notes seront perdues.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => removeSheet(entry.userBook.id),
        },
      ],
    );
  };

  const globalTemplate = useSheetTemplates((s) => s.global);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<SheetSearchDrawerValue>(
    DEFAULT_SHEET_FILTERS,
  );
  // Search draft = ce que l'utilisateur tape. `search` = valeur appliquée
  // au filtre, debouncée 500ms pour éviter de re-filtrer à chaque keystroke.
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  // Counts de réactions par sheet.id, fetché à la demande quand sort='liked'.
  // Fiches non-sync'ées (sans id) restent à 0 et coulent en bas du tri.
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    if (searchDraft === search) return;
    const t = setTimeout(() => setSearch(searchDraft.trim()), 500);
    return () => clearTimeout(t);
  }, [searchDraft, search]);

  const entries = useMemo<Entry[]>(() => {
    const bookById = new Map(books.map((b) => [b.id, b]));
    const query = search.toLowerCase();
    const all = Object.values(sheets)
      .map((sheet) => ({ sheet, userBook: bookById.get(sheet.userBookId) }))
      .filter((e): e is Entry => !!e.userBook);
    const afterPublished = filters.publishedOnly
      ? all.filter((e) => e.sheet.isPublic === true)
      : all;
    const filtered = query
      ? afterPublished.filter((e) => {
          const title = e.userBook.book.title.toLowerCase();
          if (title.includes(query)) return true;
          return e.userBook.book.authors.some((a) =>
            a.toLowerCase().includes(query),
          );
        })
      : afterPublished;
    if (filters.sort === "liked") {
      return [...filtered].sort((a, b) => {
        const ca = a.sheet.id ? (reactionCounts[a.sheet.id] ?? 0) : 0;
        const cb = b.sheet.id ? (reactionCounts[b.sheet.id] ?? 0) : 0;
        if (cb !== ca) return cb - ca;
        return (
          new Date(b.sheet.updatedAt).getTime() -
          new Date(a.sheet.updatedAt).getTime()
        );
      });
    }
    return [...filtered].sort(
      (a, b) =>
        new Date(b.sheet.updatedAt).getTime() -
        new Date(a.sheet.updatedAt).getTime(),
    );
  }, [sheets, books, search, filters, reactionCounts]);

  // Fetch des counts de réactions pour les fiches sync'ées quand le tri
  // 'liked' est actif. Query directe groupée — on n'agrège pas server-side,
  // on grouper en JS. Si une fiche n'a aucune réaction, elle n'apparaît pas
  // dans le résultat → count 0 implicite.
  useEffect(() => {
    if (filters.sort !== "liked") return;
    const ids = Object.values(sheets)
      .map((s) => s.id)
      .filter((id): id is string => !!id);
    if (ids.length === 0) {
      setReactionCounts({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("social_reactions")
        .select("target_id")
        .eq("target_kind", "sheet")
        .in("target_id", ids);
      if (cancelled) return;
      if (error || !data) {
        setReactionCounts({});
        return;
      }
      const counts: Record<string, number> = {};
      for (const row of data as { target_id: string }[]) {
        counts[row.target_id] = (counts[row.target_id] ?? 0) + 1;
      }
      setReactionCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.sort, sheets]);

  const hasActiveDrawerFilters =
    filters.sort !== DEFAULT_SHEET_FILTERS.sort ||
    filters.publishedOnly !== DEFAULT_SHEET_FILTERS.publishedOnly;
  const hasAnySheet = Object.keys(sheets).length > 0;

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top"]}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-28">
        <Animated.View
          entering={FadeInDown.duration(500)}
          className="flex-row items-center gap-3"
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Retour"
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
          >
            <MaterialIcons name="arrow-back" size={22} color={theme.ink} />
          </Pressable>
          <View className="flex-1">
            <Text className="font-display text-3xl text-ink">Mes fiches</Text>
            <Text className="mt-1 text-sm text-ink-muted">
              {entries.length === 0
                ? "Note ce que tu penses des livres que tu lis."
                : `${entries.length} fiche${entries.length > 1 ? "s" : ""} en cours`}
            </Text>
          </View>
        </Animated.View>

        <Pressable
          // Types Expo Router à régénérer (.expo/types/router.d.ts) au prochain
          // dev server start ; cast en attendant pour ne pas bloquer le check TS.
          onPress={() => router.push("/templates" as never)}
          accessibilityLabel="Mes templates de fiches"
          className="mt-6 flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3 active:bg-paper-shade"
        >
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-paper-shade">
              <MaterialIcons
                name="auto-awesome-mosaic"
                size={18}
                color={theme.ink}
              />
            </View>
            <View>
              <Text className="font-sans-med text-base text-ink">
                Mes templates
              </Text>
              <Text className="text-xs text-ink-muted">
                Réutilise un style, partage à la communauté
              </Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={theme.ink} />
        </Pressable>

        <View className="mt-6 flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center gap-2 rounded-full bg-paper-warm px-4 py-2.5">
            <MaterialIcons name="search" size={18} color={theme.inkMuted} />
            <TextInput
              value={searchDraft}
              onChangeText={setSearchDraft}
              placeholder="Nom du livre ou de l’auteur…"
              placeholderTextColor={theme.inkMuted}
              style={{ color: theme.ink, flex: 1, fontSize: 14 }}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchDraft.length > 0 ? (
              <Pressable onPress={() => setSearchDraft("")} hitSlop={8}>
                <MaterialIcons name="close" size={16} color={theme.inkMuted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setFilterOpen(true)}
            accessibilityLabel="Filtrer les fiches"
            hitSlop={6}
            className="h-11 w-11 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade"
          >
            <MaterialIcons name="tune" size={20} color={theme.ink} />
            {hasActiveDrawerFilters ? (
              <View
                className="absolute h-2.5 w-2.5 rounded-full bg-accent"
                style={{ top: 8, right: 8 }}
              />
            ) : null}
          </Pressable>
        </View>

        {entries.length === 0 ? (
          hasAnySheet ? (
            <NoMatchState />
          ) : (
            <EmptyState onCreate={() => router.push("/sheet/new")} />
          )
        ) : (
          <View className="mt-3 gap-3">
            {entries.map((e, i) => {
              const effective = mergeAppearance(
                globalTemplate,
                e.sheet.appearance,
              );
              const isCustom = isCustomAppearance(
                e.sheet.appearance,
                globalTemplate,
              );
              return (
                <Animated.View
                  key={e.sheet.userBookId}
                  entering={FadeIn.duration(300).delay(i * 40)}
                >
                  {/* Ombre rendue ICI (hors Swipeable) car `Swipeable`
                      impose `overflow:'hidden'` sur son container, ce qui
                      clipperait toute ombre cast par les enfants. Le
                      wrapper a `backgroundColor: paper` (matche le bg de
                      page → invisible) + `borderRadius` pour qu'iOS
                      calcule un shadowPath qui suit la forme arrondie. */}
                  <View
                    style={{
                      borderRadius: effective.frame.radius,
                      backgroundColor: theme.paper,
                      shadowColor: "#000",
                      shadowOpacity: 0.15,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 3,
                    }}
                  >
                    <Swipeable
                      renderRightActions={() => (
                        <DeleteAction onPress={() => confirmDelete(e)} />
                      )}
                      overshootRight={false}
                      rightThreshold={48}
                    >
                      <View
                        style={{
                          backgroundColor: theme.paper,
                          borderRadius: effective.frame.radius,
                        }}
                      >
                        <SheetCard
                          userBook={e.userBook}
                          sheet={e.sheet}
                          appearance={effective}
                          isCustom={isCustom}
                          headerOnly
                          withShadow={false}
                          onPress={() =>
                            // Read-only par défaut. Fallback éditeur si pas
                            // encore sync'ée (id absent).
                            e.sheet.id
                              ? router.push(`/sheet/view/${e.sheet.id}`)
                              : router.push(`/sheet/${e.userBook.book.isbn}`)
                          }
                        />
                      </View>
                    </Swipeable>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <HomeFab />

      <SheetSearchDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onChange={setFilters}
      />
    </SafeAreaView>
  );
}

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Supprimer la fiche"
      style={{ backgroundColor: "#b8503a" }}
      className="my-1 ml-2 items-center justify-center rounded-2xl px-5 active:opacity-80"
    >
      <MaterialIcons name="delete-outline" size={24} color="#fbf8f4" />
      <Text className="mt-1 text-xs font-sans-med text-paper">Supprimer</Text>
    </Pressable>
  );
}

function NoMatchState() {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="mt-10 items-center rounded-3xl bg-paper-warm p-8"
    >
      <MaterialIcons name="search-off" size={36} color="#6b6259" />
      <Text className="mt-3 text-center font-display text-xl text-ink">
        Aucune fiche trouvée
      </Text>
      <Text className="mt-2 text-center text-ink-muted">
        Essaie d&apos;élargir tes filtres.
      </Text>
    </Animated.View>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(500).delay(150)}
      className="mt-10 items-center rounded-3xl bg-paper-warm p-8"
    >
      <Text className="text-center font-display text-2xl text-ink">
        Aucune fiche
      </Text>
      <Text className="mt-2 text-center text-ink-muted">
        Les fiches de lecture te permettent de noter tes impressions, tes
        personnages favoris, ton avis sur l&apos;histoire.
      </Text>
      <Pressable
        onPress={onCreate}
        className="mt-6 rounded-full bg-accent px-6 py-3 active:opacity-80"
      >
        <Text className="font-sans-med text-paper">+ Nouvelle fiche</Text>
      </Pressable>
    </Animated.View>
  );
}
