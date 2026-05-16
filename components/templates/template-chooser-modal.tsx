import { TemplateCard } from '@/components/template-card';
import {
  TemplateSearchDrawer,
  type SearchDrawerValue,
} from '@/components/templates/template-search-drawer';
import { UserCard } from '@/components/user-card';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useReadingSheetTemplates } from '@/store/reading-sheet-templates';
import { usePremium } from '@/store/premium';
import type {
  PublicReadingSheetTemplate,
  ReadingSheetTemplate,
} from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Mode = 'root' | 'mine' | 'community';

type Choice =
  | { kind: 'template'; templateId: string }
  | { kind: 'blank' };

type Props = {
  open: boolean;
  onClose: () => void;
  // Appelée quand le user a fait son choix. La caller décide quoi en faire
  // (route vers /sheet/[isbn]?template_id=… ou applique directement sur un
  // draft local). `blank` = aucun template, fiche from scratch.
  onPick: (choice: Choice) => void;
  // Si non-premium, les templates premium déclenchent un paywall plutôt que
  // d'appeler onPick. Le caller doit afficher la modale paywall.
  onPaywallRequired: () => void;
};

const DEFAULT_FILTERS: SearchDrawerValue = {
  search: '',
  genres: [],
  sort: 'popular',
  includePremium: true,
};

export function TemplateChooserModal({
  open,
  onClose,
  onPick,
  onPaywallRequired,
}: Props) {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const router = useRouter();
  const mine = useReadingSheetTemplates((s) => s.mine);
  const listPublic = useReadingSheetTemplates((s) => s.listPublic);
  const isPremium = usePremium((s) => s.isPremium);

  // Fermer le chooser avant d'ouvrir un profil utilisateur : sinon, l'écran
  // de profil se monte par-dessus le chooser, et un back ramène sur le
  // chooser ouvert dans un état figé (point de départ déjà choisi mais
  // jamais validé). Le user repart proprement sur l'écran d'origine.
  const openProfile = (userId: string) => {
    onClose();
    router.push(`/profile/${userId}` as never);
  };

  const [mode, setMode] = useState<Mode>('root');
  const [community, setCommunity] = useState<PublicReadingSheetTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<SearchDrawerValue>(DEFAULT_FILTERS);

  useEffect(() => {
    if (open) {
      setMode('root');
      setFilters(DEFAULT_FILTERS);
    }
  }, [open]);

  // Fetch initial + re-fetch à chaque changement de filtre quand l'onglet
  // communautaire est actif.
  useEffect(() => {
    if (mode !== 'community') return;
    let cancelled = false;
    setLoading(true);
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, filters, listPublic]);

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

  const pick = (
    t: ReadingSheetTemplate | PublicReadingSheetTemplate,
  ) => {
    if (t.isPremium && !isPremium) {
      onPaywallRequired();
      return;
    }
    onPick({ kind: 'template', templateId: t.id });
  };

  const myCount = mine.length;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/40" />
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper"
        style={{ paddingBottom: insets.bottom, maxHeight: '85%' }}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <View className="flex-row items-center gap-2">
            {mode !== 'root' ? (
              <Pressable
                onPress={() => setMode('root')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full active:opacity-60">
                <MaterialIcons name="arrow-back" size={20} color={theme.ink} />
              </Pressable>
            ) : null}
            <Text className="font-display text-xl text-ink">
              {mode === 'root' && 'Choisir un point de départ'}
              {mode === 'mine' && 'Mes templates'}
              {mode === 'community' && 'Templates communautaires'}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
            <MaterialIcons name="close" size={18} color={theme.ink} />
          </Pressable>
        </View>

        {mode === 'root' ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            {myCount === 1 ? (
              <ChooserRow
                icon="auto-awesome"
                title={`Mon template — ${mine[0].name}`}
                subtitle="Réutilise ta composition habituelle."
                onPress={() => pick(mine[0])}
                premium={mine[0].isPremium}
              />
            ) : myCount > 1 ? (
              <ChooserRow
                icon="auto-awesome-mosaic"
                title="Mes templates"
                subtitle={`${myCount} templates créés — choisis-en un.`}
                onPress={() => setMode('mine')}
                chevron
              />
            ) : (
              <View className="rounded-2xl bg-paper-warm px-4 py-3">
                <Text className="text-sm text-ink-muted">
                  Tu n’as pas encore de template. Crée-en un depuis l’écran Templates.
                </Text>
              </View>
            )}

            <View className="mt-3" />
            <ChooserRow
              icon="public"
              title="Template communautaire"
              subtitle="Pioche dans les templates partagés par d’autres lecteurs."
              onPress={() => setMode('community')}
              chevron
            />

            <View className="mt-3" />
            <ChooserRow
              icon="edit-note"
              title="Nouveau template"
              subtitle="Fiche vierge avec ta personnalisation par défaut."
              onPress={() => onPick({ kind: 'blank' })}
            />
          </ScrollView>
        ) : null}

        {mode === 'mine' ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            <View className="gap-3">
              {mine.map((t) => (
                <View key={t.id}>
                  <TemplateCard
                    template={t}
                    headerOnly
                    onPress={() => pick(t)}
                    premiumBadge={t.isPremium}
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {mode === 'community' ? (
          <>
            <Pressable
              onPress={() => setDrawerOpen(true)}
              className="mx-5 mb-2 flex-row items-center gap-2 rounded-full bg-paper-warm px-4 py-2.5 active:bg-paper-shade">
              <MaterialIcons name="search" size={18} color={theme.inkMuted} />
              <Text className="flex-1 text-sm text-ink-muted">
                {filterChips.length === 0
                  ? 'Rechercher, filtrer…'
                  : filterChips.join(' · ')}
              </Text>
              <MaterialIcons name="tune" size={18} color={theme.inkMuted} />
            </Pressable>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              {loading ? (
                <View className="mt-12 items-center">
                  <ActivityIndicator color="#c27b52" />
                </View>
              ) : community.length > 0 ? (
                <View className="gap-4">
                  {community.map((t) => (
                    <View key={t.id}>
                      <TemplateCard
                        template={t}
                        headerOnly
                        onPress={() => pick(t)}
                        premiumBadge={t.isPremium}
                      />
                      <View className="mt-1.5 px-1">
                        <UserCard
                          userId={t.userId}
                          variant="compact"
                          size="sm"
                          onPress={() => openProfile(t.userId)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="mt-10 text-center text-sm text-ink-muted">
                  Aucun template ne correspond à ces filtres.
                </Text>
              )}
            </ScrollView>
          </>
        ) : null}
      </View>

      <TemplateSearchDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initial={filters}
        onApply={(next) => setFilters(next)}
      />
    </Modal>
  );
}

function ChooserRow({
  icon,
  title,
  subtitle,
  onPress,
  chevron,
  premium,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  chevron?: boolean;
  premium?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl bg-paper-warm px-4 py-3 active:bg-paper-shade">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-paper-shade">
        <MaterialIcons name={icon} size={20} color="#3a322b" />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-1">
          <Text className="font-sans-med text-base text-ink">{title}</Text>
          {premium ? <MaterialIcons name="star" size={13} color="#f59e0b" /> : null}
        </View>
        <Text className="text-xs text-ink-muted">{subtitle}</Text>
      </View>
      {chevron ? <MaterialIcons name="chevron-right" size={22} color="#6b6259" /> : null}
    </Pressable>
  );
}
