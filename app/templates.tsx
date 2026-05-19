import { BookPlaceholder } from "@/components/book-placeholder";
import { PremiumPaywallModal } from "@/components/premium-paywall-modal";
import { SheetCustomizer } from "@/components/sheet-customizer";
import { SheetSurface } from "@/components/sheet-surface";
import { TemplateCard } from "@/components/template-card";
import {
  DEFAULT_TEMPLATE_FILTERS,
  TemplateSearchDrawer,
  type SearchDrawerValue,
} from "@/components/templates/template-search-drawer";
import { UserCard } from "@/components/user-card";
import { useAuth } from "@/hooks/use-auth";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { SHEET_TEXT_SHADOW } from "@/lib/sheet-appearance";
import { getFont } from "@/lib/theme/fonts";
import { usePremium } from "@/store/premium";
import { useReadingSheetTemplates } from "@/store/reading-sheet-templates";
import { useSheetTemplates } from "@/store/sheet-templates";
import type { PublicReadingSheetTemplate, SheetAppearance } from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

type Tab = "mine" | "community";

export default function TemplatesScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const mine = useReadingSheetTemplates((s) => s.mine);
  const mineLoaded = useReadingSheetTemplates((s) => s.mineLoaded);
  const listPublic = useReadingSheetTemplates((s) => s.listPublic);
  const toggleLikeStore = useReadingSheetTemplates((s) => s.toggleLike);
  const fetchMine = useReadingSheetTemplates((s) => s.fetchMine);
  const isPremium = usePremium((s) => s.isPremium);

  const globalTemplate = useSheetTemplates((s) => s.global);
  const setGlobalTemplate = useSheetTemplates((s) => s.setGlobal);
  const resetGlobalTemplate = useSheetTemplates((s) => s.resetGlobal);
  const globalIsPublic = useSheetTemplates((s) => s.globalIsPublic);
  const setGlobalIsPublic = useSheetTemplates((s) => s.setGlobalIsPublic);

  const [tab, setTab] = useState<Tab>("mine");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<SearchDrawerValue>(
    DEFAULT_TEMPLATE_FILTERS,
  );
  // Search draft = ce que l'utilisateur tape. `search` = valeur appliquée
  // au filtre, debouncée 500ms (même pattern que /sheets).
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [community, setCommunity] = useState<PublicReadingSheetTemplate[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [globalEditOpen, setGlobalEditOpen] = useState(false);

  useEffect(() => {
    if (searchDraft === search) return;
    const t = setTimeout(() => setSearch(searchDraft.trim()), 500);
    return () => clearTimeout(t);
  }, [searchDraft, search]);

  // Fetch public à l'arrivée sur l'onglet OU à chaque changement de filtre.
  useEffect(() => {
    if (tab !== "community") return;
    let cancelled = false;
    setCommunityLoading(true);
    listPublic({
      search,
      genres: filters.genres,
      sort: filters.sort,
      includePremium: filters.includePremium,
      limit: 50,
    })
      .then((rows) => {
        if (cancelled) return;
        setCommunity(rows);
      })
      .finally(() => {
        if (!cancelled) setCommunityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, search, filters, listPublic]);

  // Re-fetch mes templates au focus (au cas où on arrive depuis l'éditeur).
  useEffect(() => {
    if (!userId) return;
    if (tab === "mine" && !mineLoaded) {
      void fetchMine(userId);
    }
  }, [tab, mineLoaded, userId, fetchMine]);

  const hasActiveDrawerFilters =
    filters.genres.length !== DEFAULT_TEMPLATE_FILTERS.genres.length ||
    filters.sort !== DEFAULT_TEMPLATE_FILTERS.sort ||
    filters.includePremium !== DEFAULT_TEMPLATE_FILTERS.includePremium;

  // Filtre local de "Mes templates" : par nom, et par genres si la coche
  // genre est posée dans le drawer. La sort/premium du drawer ne s'applique
  // pas au tab Mine (le tri sort/popular n'a pas de sens sur tes propres
  // templates, et la coche premium est pensée pour la communauté).
  const filteredMine = useMemo(() => {
    const query = search.toLowerCase();
    return mine.filter((t) => {
      if (query && !t.name.toLowerCase().includes(query)) return false;
      if (filters.genres.length > 0) {
        const hit = filters.genres.some((g) => t.genres.includes(g));
        if (!hit) return false;
      }
      return true;
    });
  }, [mine, search, filters.genres]);

  const handleTemplatePress = (t: PublicReadingSheetTemplate) => {
    if (t.isPremium && !isPremium) {
      setPaywall(true);
      return;
    }
    router.push(`/template/view/${t.id}` as never);
  };

  const handleMyTemplatePress = (templateId: string) => {
    router.push(`/template/${templateId}` as never);
  };

  const deleteTemplate = useReadingSheetTemplates((s) => s.deleteTemplate);
  const confirmDeleteTemplate = (
    t: ReturnType<typeof useReadingSheetTemplates.getState>["mine"][number],
  ) => {
    Alert.alert(
      "Supprimer le template ?",
      `« ${t.name} » sera supprimé. Les fiches existantes basées dessus restent intactes.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            void deleteTemplate(t.id);
          },
        },
      ],
    );
  };

  const handleLike = async (t: PublicReadingSheetTemplate) => {
    const next = await toggleLikeStore(t.id, t.isLiked);
    setCommunity((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              isLiked: next,
              likesCount: next
                ? x.likesCount + 1
                : Math.max(0, x.likesCount - 1),
            }
          : x,
      ),
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top"]}>
      <View className="flex-row items-center gap-3 px-5 pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Retour"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={theme.ink} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-display text-3xl text-ink">Templates</Text>
          <Text className="mt-1 text-sm text-ink-muted">
            Composer une fois, réutiliser à volonté.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/template/new" as never)}
          accessibilityLabel="Créer un template"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full bg-accent active:opacity-80"
        >
          <MaterialIcons name="add" size={22} color="#fbf8f4" />
        </Pressable>
      </View>

      <View className="mt-4 flex-row gap-2 px-5">
        <TabPill
          label="Mes templates"
          active={tab === "mine"}
          onPress={() => setTab("mine")}
        />
        <TabPill
          label="Communautaire"
          active={tab === "community"}
          onPress={() => setTab("community")}
        />
      </View>

      <View className="mx-5 mt-3 flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-full bg-paper-warm px-4 py-2.5">
          <MaterialIcons name="search" size={18} color={theme.inkMuted} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder={
              tab === "community"
                ? "Nom de template ou d’utilisateur…"
                : "Nom de template…"
            }
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
          onPress={() => setDrawerOpen(true)}
          accessibilityLabel="Filtrer les templates"
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

      <ScrollView
        contentContainerClassName="px-4 pt-4 pb-32"
        showsVerticalScrollIndicator={false}
      >
        {tab === "mine" ? (
          <MineList
            templates={filteredMine}
            allCount={mine.length}
            loaded={mineLoaded}
            onPressTemplate={handleMyTemplatePress}
            onCreate={() => router.push("/template/new" as never)}
            onEditGlobal={() => setGlobalEditOpen(true)}
            onDelete={confirmDeleteTemplate}
            paperColor={theme.paper}
            globalAppearance={globalTemplate}
          />
        ) : (
          <CommunityList
            templates={community}
            loading={communityLoading}
            isPremium={isPremium}
            onPressTemplate={handleTemplatePress}
            onLike={handleLike}
          />
        )}
      </ScrollView>

      <TemplateSearchDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={filters}
        onChange={setFilters}
      />

      <PremiumPaywallModal
        open={paywall}
        reason="template_premium"
        onClose={() => setPaywall(false)}
      />

      <SheetCustomizer
        open={globalEditOpen}
        appearance={globalTemplate}
        title="Template global"
        subtitle="Base par défaut pour toutes tes fiches"
        onClose={() => setGlobalEditOpen(false)}
        onSave={(next) => {
          setGlobalTemplate(next);
          setGlobalEditOpen(false);
        }}
        onReset={resetGlobalTemplate}
        resetLabel="Tout réinitialiser"
        publicToggle={{ value: globalIsPublic, onChange: setGlobalIsPublic }}
      />
    </SafeAreaView>
  );
}

function TabPill({
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
      className={`rounded-full px-4 py-2 active:opacity-70 ${active ? "bg-ink" : "bg-paper-warm"}`}
    >
      <Text
        className={`text-sm font-sans-med ${active ? "text-paper" : "text-ink"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MineList({
  templates,
  allCount,
  loaded,
  onPressTemplate,
  onCreate,
  onEditGlobal,
  onDelete,
  paperColor,
  globalAppearance,
}: {
  templates: ReturnType<typeof useReadingSheetTemplates.getState>["mine"];
  allCount: number;
  loaded: boolean;
  onPressTemplate: (id: string) => void;
  onCreate: () => void;
  onEditGlobal: () => void;
  onDelete: (
    t: ReturnType<typeof useReadingSheetTemplates.getState>["mine"][number],
  ) => void;
  paperColor: string;
  globalAppearance: SheetAppearance;
}) {
  if (!loaded) {
    return (
      <View className="mt-12 items-center">
        <ActivityIndicator color="#c27b52" />
      </View>
    );
  }
  const globalFont = getFont(globalAppearance.fontId as any);
  const globalDisplayFont = globalFont.variants.display;
  const globalSansFont = globalFont.variants.sans;
  const { textColor: globalTextColor, mutedColor: globalMutedColor } =
    globalAppearance;
  const globalEditButton = (
    <View
      style={{
        backgroundColor: paperColor,
        borderRadius: globalAppearance.frame.radius,
      }}
    >
      <Pressable
        onPress={onEditGlobal}
        accessibilityLabel="Modifier mon template global"
        className="active:opacity-80"
      >
        <SheetSurface
          appearance={globalAppearance}
          padding={12}
          style={{
            borderRadius: globalAppearance.frame.radius,
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <BookPlaceholder
              style={{ width: 48, height: 72, borderRadius: 6 }}
              icon="settings"
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  {
                    color: globalTextColor,
                    fontFamily: globalDisplayFont,
                    fontSize: 16,
                  },
                  SHEET_TEXT_SHADOW,
                ]}
              >
                Modifier mon template global
              </Text>
              <Text
                style={[
                  {
                    color: globalMutedColor,
                    fontFamily: globalSansFont,
                    fontSize: 12,
                    marginTop: 2,
                  },
                  SHEET_TEXT_SHADOW,
                ]}
              >
                Base par défaut pour toutes tes fiches
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={globalTextColor}
            />
          </View>
        </SheetSurface>
      </Pressable>
    </View>
  );
  if (templates.length === 0) {
    if (allCount > 0) {
      return (
        <View>
          {globalEditButton}
          <Animated.View
            entering={FadeIn.duration(300)}
            className="mt-10 items-center rounded-3xl bg-paper-warm p-8"
          >
            <MaterialIcons name="search-off" size={36} color="#6b6259" />
            <Text className="mt-3 text-center font-display text-xl text-ink">
              Aucun template trouvé
            </Text>
            <Text className="mt-2 text-center text-ink-muted">
              Essaie d&apos;élargir tes filtres.
            </Text>
          </Animated.View>
        </View>
      );
    }
    return (
      <View>
        {globalEditButton}
        <Animated.View
          entering={FadeIn.duration(400)}
          className="mt-10 items-center rounded-3xl bg-paper-warm p-8"
        >
          <MaterialIcons name="auto-awesome-mosaic" size={36} color="#c27b52" />
          <Text className="mt-3 text-center font-display text-2xl text-ink">
            Aucun template
          </Text>
          <Text className="mt-2 text-center text-ink-muted">
            Les templates peuvent être utilisés sur plusieurs fiches et partagés
            à la communauté si vous le souhaitez !
          </Text>
          <Pressable
            onPress={onCreate}
            className="mt-6 rounded-full bg-accent px-6 py-3 active:opacity-80"
          >
            <Text className="font-sans-med text-paper">
              + Créer un template
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }
  return (
    <View className="gap-3">
      {globalEditButton}
      {templates.map((t, i) => (
        <Animated.View key={t.id} entering={FadeIn.duration(300).delay(i * 40)}>
          {/* Ombre rendue ICI (hors Swipeable) car `Swipeable` impose
              `overflow:hidden` sur son container, ce qui clippe toute ombre
              cast par les enfants. Le wrapper a `backgroundColor: paperColor`
              (matche le bg de page → invisible) + `borderRadius` pour qu'iOS
              calcule un shadowPath qui suit la forme arrondie. */}
          <View
            style={{
              borderRadius: t.appearance.frame.radius,
              backgroundColor: paperColor,
              shadowColor: "#000",
              shadowOpacity: 0.1,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            }}
          >
            <Swipeable
              renderRightActions={() => (
                <DeleteAction onPress={() => onDelete(t)} />
              )}
              overshootRight={false}
              rightThreshold={48}
            >
              <View
                style={{
                  backgroundColor: paperColor,
                  borderRadius: t.appearance.frame.radius,
                }}
              >
                <TemplateCard
                  template={t}
                  headerOnly
                  onPress={() => onPressTemplate(t.id)}
                  premiumBadge={t.isPremium}
                  withShadow={false}
                />
              </View>
            </Swipeable>
          </View>
          <View className="mt-2 flex-row items-center gap-2 px-1">
            {t.isPublic ? (
              <View className="flex-row items-center gap-1 rounded-full bg-accent-pale px-2 py-0.5">
                <MaterialIcons name="public" size={11} color="#c27b52" />
                <Text className="text-[10px] text-accent-deep">Publié</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-1 rounded-full bg-paper-warm px-2 py-0.5">
                <MaterialIcons name="lock-outline" size={11} color="#6b6259" />
                <Text className="text-[10px] text-ink-muted">Privé</Text>
              </View>
            )}
            {t.likesCount > 0 ? (
              <View className="flex-row items-center gap-1">
                <MaterialIcons name="favorite" size={11} color="#d4493e" />
                <Text className="text-[10px] text-ink-muted">
                  {t.likesCount}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Supprimer le template"
      style={{ backgroundColor: "#b8503a" }}
      className="my-1 ml-2 items-center justify-center rounded-2xl px-5 active:opacity-80"
    >
      <MaterialIcons name="delete-outline" size={24} color="#fbf8f4" />
      <Text className="mt-1 text-xs font-sans-med text-paper">Supprimer</Text>
    </Pressable>
  );
}

function CommunityList({
  templates,
  loading,
  isPremium,
  onPressTemplate,
  onLike,
}: {
  templates: PublicReadingSheetTemplate[];
  loading: boolean;
  isPremium: boolean;
  onPressTemplate: (t: PublicReadingSheetTemplate) => void;
  onLike: (t: PublicReadingSheetTemplate) => void;
}) {
  if (loading) {
    return (
      <View className="mt-12 items-center">
        <ActivityIndicator color="#c27b52" />
      </View>
    );
  }
  if (templates.length === 0) {
    return (
      <View className="mt-10 items-center rounded-3xl bg-paper-warm p-8">
        <MaterialIcons name="search-off" size={36} color="#6b6259" />
        <Text className="mt-3 text-center font-display text-xl text-ink">
          Aucun template trouvé
        </Text>
        <Text className="mt-2 text-center text-ink-muted">
          Essaie d’élargir tes filtres ou de cocher l’inclusion des templates
          Premium.
        </Text>
      </View>
    );
  }
  return (
    <View className="mt-2 gap-4">
      {templates.map((t, i) => {
        const locked = t.isPremium && !isPremium;
        return (
          <Animated.View
            key={t.id}
            entering={FadeInDown.duration(280).delay(i * 30)}
          >
            <TemplateCard
              template={t}
              headerOnly
              onPress={() => onPressTemplate(t)}
              premiumBadge={t.isPremium}
            />
            <View className="mt-2 flex-row items-center justify-between gap-2 px-1">
              <View className="flex-1">
                <UserCard userId={t.userId} variant="compact" size="sm" />
              </View>
              <Pressable
                onPress={() => onLike(t)}
                accessibilityLabel={
                  t.isLiked ? "Retirer le like" : "Aimer le template"
                }
                hitSlop={8}
                className="flex-row items-center gap-1 rounded-full bg-paper-warm px-3 py-1.5 active:bg-paper-shade"
              >
                <MaterialIcons
                  name={t.isLiked ? "favorite" : "favorite-border"}
                  size={14}
                  color={t.isLiked ? "#d4493e" : "#6b6259"}
                />
                <Text className="text-xs text-ink">{t.likesCount}</Text>
              </Pressable>
            </View>
            {locked ? (
              <Text className="mt-1 px-1 text-[10px] text-ink-muted">
                Contient des éléments Premium — paywall au clic.
              </Text>
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
}
