import { useThemeColors } from '@/hooks/use-theme-colors';
import { useReadingSheetTemplates, type TemplateSort } from '@/store/reading-sheet-templates';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SearchDrawerValue = {
  genres: string[];
  sort: TemplateSort;
  includePremium: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  value: SearchDrawerValue;
  onChange: (next: SearchDrawerValue) => void;
};

const SORT_OPTIONS: { value: TemplateSort; label: string }[] = [
  { value: 'popular', label: 'Les plus utilisés' },
  { value: 'recent', label: 'Les plus récents' },
  { value: 'liked', label: 'Les plus aimés' },
];

export const DEFAULT_TEMPLATE_FILTERS: SearchDrawerValue = {
  genres: [],
  sort: 'popular',
  includePremium: true,
};

// Drawer plein écran avec filtres : checkboxes genres, tri, coche Premium.
// La recherche texte vit hors drawer, en input dédié dans le parent (même
// pattern que /sheets). Pas de bouton Appliquer — les changements remontent
// immédiatement au parent.
export function TemplateSearchDrawer({ open, onClose, value, onChange }: Props) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const genres = useReadingSheetTemplates((s) => s.genres);

  const toggleGenre = (slug: string) => {
    const next = value.genres.includes(slug)
      ? value.genres.filter((g) => g !== slug)
      : [...value.genres, slug];
    onChange({ ...value, genres: next });
  };

  const setSort = (sort: TemplateSort) => onChange({ ...value, sort });
  const togglePremium = () =>
    onChange({ ...value, includePremium: !value.includePremium });
  const reset = () => onChange(DEFAULT_TEMPLATE_FILTERS);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/40" />
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper"
        style={{ paddingBottom: insets.bottom, maxHeight: '85%' }}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <Text className="font-display text-xl text-ink">Filtres</Text>
          <Pressable onPress={onClose} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
            <MaterialIcons name="close" size={18} color={theme.ink} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled">
          <Text className="font-sans-med text-sm text-ink-muted">Genres</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {genres.map((g) => {
              const active = value.genres.includes(g.slug);
              return (
                <Pressable
                  key={g.slug}
                  onPress={() => toggleGenre(g.slug)}
                  className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70 ${active ? 'bg-accent' : 'bg-paper-warm'}`}>
                  <MaterialIcons
                    name={active ? 'check' : 'add'}
                    size={14}
                    color={active ? '#fbf8f4' : theme.inkMuted}
                  />
                  <Text className={`text-sm ${active ? 'text-paper' : 'text-ink'}`}>{g.label}</Text>
                </Pressable>
              );
            })}
            {genres.length === 0 ? (
              <Text className="text-xs text-ink-muted">Aucun genre disponible.</Text>
            ) : null}
          </View>

          <Text className="mt-5 font-sans-med text-sm text-ink-muted">Trier par</Text>
          <View className="mt-2 gap-2">
            {SORT_OPTIONS.map((opt) => {
              const active = value.sort === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setSort(opt.value)}
                  className="flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3 active:bg-paper-shade">
                  <Text className="text-sm text-ink">{opt.label}</Text>
                  <MaterialIcons
                    name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={18}
                    color={active ? theme.accent : theme.inkMuted}
                  />
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={togglePremium}
            className="mt-5 flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3 active:bg-paper-shade">
            <View className="flex-row items-center gap-2">
              <MaterialIcons name="star" size={16} color="#f59e0b" />
              <View>
                <Text className="text-sm text-ink">Inclure les templates Premium</Text>
                <Text className="text-xs text-ink-muted">Le paywall s’ouvrira au clic.</Text>
              </View>
            </View>
            <MaterialIcons
              name={value.includePremium ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={value.includePremium ? theme.accent : theme.inkMuted}
            />
          </Pressable>
        </ScrollView>

        <View className="px-5 pt-3" style={{ paddingBottom: 12 }}>
          <Pressable
            onPress={reset}
            className="items-center rounded-full bg-paper-warm px-4 py-3 active:bg-paper-shade">
            <Text className="font-sans-med text-sm text-ink">Réinitialiser</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
