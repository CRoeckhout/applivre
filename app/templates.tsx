import { PremiumPaywallModal } from '@/components/premium-paywall-modal';
import { TemplateCard } from '@/components/template-card';
import {
  TemplateSearchDrawer,
  type SearchDrawerValue,
} from '@/components/templates/template-search-drawer';
import { UserCard } from '@/components/user-card';
import { useAuth } from '@/hooks/use-auth';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  useReadingSheetTemplates,
  type TemplateSort,
} from '@/store/reading-sheet-templates';
import { usePremium } from '@/store/premium';
import type { PublicReadingSheetTemplate } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'mine' | 'community';

const DEFAULT_FILTERS: SearchDrawerValue = {
  search: '',
  genres: [],
  sort: 'popular',
  includePremium: true,
};

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

  const [tab, setTab] = useState<Tab>('mine');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<SearchDrawerValue>(DEFAULT_FILTERS);
  const [community, setCommunity] = useState<PublicReadingSheetTemplate[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);

  // Fetch public à l'arrivée sur l'onglet OU à chaque changement de filtre.
  useEffect(() => {
    if (tab !== 'community') return;
    let cancelled = false;
    setCommunityLoading(true);
    listPublic({
      search: filters.search,
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
  }, [tab, filters, listPublic]);

  // Re-fetch mes templates au focus (au cas où on arrive depuis l'éditeur).
  useEffect(() => {
    if (!userId) return;
    if (tab === 'mine' && !mineLoaded) {
      void fetchMine(userId);
    }
  }, [tab, mineLoaded, userId, fetchMine]);

  const filterChips = useMemo(() => {
    const chips: string[] = [];
    if (filters.search) chips.push(`« ${filters.search} »`);
    if (filters.genres.length > 0) chips.push(`${filters.genres.length} genre·s`);
    if (filters.sort !== 'popular') {
      chips.push(filters.sort === 'recent' ? 'Récents' : 'Aimés');
    }
    if (!filters.includePremium) chips.push('Sans premium');
    return chips;
  }, [filters]);

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

  const handleLike = async (t: PublicReadingSheetTemplate) => {
    const next = await toggleLikeStore(t.id, t.isLiked);
    setCommunity((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? { ...x, isLiked: next, likesCount: next ? x.likesCount + 1 : Math.max(0, x.likesCount - 1) }
          : x,
      ),
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Retour"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60">
          <MaterialIcons name="arrow-back" size={22} color={theme.ink} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-display text-3xl text-ink">Templates</Text>
          <Text className="mt-1 text-sm text-ink-muted">
            Composer une fois, réutiliser à volonté.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/template/new' as never)}
          accessibilityLabel="Créer un template"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full bg-accent active:opacity-80">
          <MaterialIcons name="add" size={22} color="#fbf8f4" />
        </Pressable>
      </View>

      <View className="mt-4 flex-row gap-2 px-5">
        <TabPill label="Mes templates" active={tab === 'mine'} onPress={() => setTab('mine')} />
        <TabPill label="Communautaire" active={tab === 'community'} onPress={() => setTab('community')} />
      </View>

      <Pressable
        onPress={() => setDrawerOpen(true)}
        className="mx-5 mt-3 flex-row items-center gap-2 rounded-full bg-paper-warm px-4 py-2.5 active:bg-paper-shade">
        <MaterialIcons name="search" size={18} color={theme.inkMuted} />
        <Text className="flex-1 text-sm text-ink-muted">
          {filterChips.length === 0 ? 'Rechercher, filtrer…' : filterChips.join(' · ')}
        </Text>
        <MaterialIcons name="tune" size={18} color={theme.inkMuted} />
      </Pressable>

      <ScrollView
        contentContainerClassName="px-4 pt-4 pb-32"
        showsVerticalScrollIndicator={false}>
        {tab === 'mine' ? (
          <MineList
            templates={mine}
            loaded={mineLoaded}
            onPressTemplate={handleMyTemplatePress}
            onCreate={() => router.push('/template/new' as never)}
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
        initial={filters}
        onApply={(next) => setFilters(next)}
      />

      <PremiumPaywallModal
        open={paywall}
        reason="template_premium"
        onClose={() => setPaywall(false)}
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
      className={`rounded-full px-4 py-2 active:opacity-70 ${active ? 'bg-ink' : 'bg-paper-warm'}`}>
      <Text className={`text-sm font-sans-med ${active ? 'text-paper' : 'text-ink'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function MineList({
  templates,
  loaded,
  onPressTemplate,
  onCreate,
}: {
  templates: ReturnType<typeof useReadingSheetTemplates.getState>['mine'];
  loaded: boolean;
  onPressTemplate: (id: string) => void;
  onCreate: () => void;
}) {
  if (!loaded) {
    return (
      <View className="mt-12 items-center">
        <ActivityIndicator color="#c27b52" />
      </View>
    );
  }
  if (templates.length === 0) {
    return (
      <Animated.View
        entering={FadeIn.duration(400)}
        className="mt-10 items-center rounded-3xl bg-paper-warm p-8">
        <MaterialIcons name="auto-awesome-mosaic" size={36} color="#c27b52" />
        <Text className="mt-3 text-center font-display text-2xl text-ink">
          Aucun template
        </Text>
        <Text className="mt-2 text-center text-ink-muted">
          Les templates peuvent être utilisés sur plusieurs fiches et partagés à la
          communauté si vous le souhaitez !
        </Text>
        <Pressable
          onPress={onCreate}
          className="mt-6 rounded-full bg-accent px-6 py-3 active:opacity-80">
          <Text className="font-sans-med text-paper">+ Créer un template</Text>
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <View className="mt-2 gap-3">
      {templates.map((t, i) => (
        <Animated.View key={t.id} entering={FadeIn.duration(300).delay(i * 40)}>
          <TemplateCard
            template={t}
            headerOnly
            onPress={() => onPressTemplate(t.id)}
            premiumBadge={t.isPremium}
          />
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
                <Text className="text-[10px] text-ink-muted">{t.likesCount}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      ))}
    </View>
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
          Essaie d’élargir tes filtres ou de cocher l’inclusion des templates Premium.
        </Text>
      </View>
    );
  }
  return (
    <View className="mt-2 gap-4">
      {templates.map((t, i) => {
        const locked = t.isPremium && !isPremium;
        return (
          <Animated.View key={t.id} entering={FadeInDown.duration(280).delay(i * 30)}>
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
                accessibilityLabel={t.isLiked ? 'Retirer le like' : 'Aimer le template'}
                hitSlop={8}
                className="flex-row items-center gap-1 rounded-full bg-paper-warm px-3 py-1.5 active:bg-paper-shade">
                <MaterialIcons
                  name={t.isLiked ? 'favorite' : 'favorite-border'}
                  size={14}
                  color={t.isLiked ? '#d4493e' : '#6b6259'}
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
