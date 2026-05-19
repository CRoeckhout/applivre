import { useThemeColors } from '@/hooks/use-theme-colors';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SheetSort = 'recent' | 'liked';

export type SheetSearchDrawerValue = {
  sort: SheetSort;
  publishedOnly: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  value: SheetSearchDrawerValue;
  onChange: (next: SheetSearchDrawerValue) => void;
};

const SORT_OPTIONS: { value: SheetSort; label: string }[] = [
  { value: 'recent', label: 'Les plus récentes' },
  { value: 'liked', label: 'Les plus aimées' },
];

export const DEFAULT_SHEET_FILTERS: SheetSearchDrawerValue = {
  sort: 'recent',
  publishedOnly: false,
};

// Drawer de filtres pour la liste des fiches. La recherche est hors drawer
// (input dédié dans le parent). Ici on règle : tri + coche "fiches publiées".
// Pas de bouton Appliquer — les changements remontent immédiatement au parent.
export function SheetSearchDrawer({ open, onClose, value, onChange }: Props) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();

  const setSort = (sort: SheetSort) => onChange({ ...value, sort });
  const togglePublished = () =>
    onChange({ ...value, publishedOnly: !value.publishedOnly });
  const reset = () => onChange(DEFAULT_SHEET_FILTERS);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/40" />
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper"
        style={{ paddingBottom: insets.bottom, maxHeight: '85%' }}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <Text className="font-display text-xl text-ink">Filtres</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
            <MaterialIcons name="close" size={18} color={theme.ink} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled">
          <Text className="font-sans-med text-sm text-ink-muted">Trier par</Text>
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
            onPress={togglePublished}
            className="mt-5 flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3 active:bg-paper-shade">
            <View className="flex-row items-center gap-2">
              <MaterialIcons name="public" size={16} color={theme.inkMuted} />
              <Text className="text-sm text-ink">Mes fiches publiées</Text>
            </View>
            <MaterialIcons
              name={value.publishedOnly ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={value.publishedOnly ? theme.accent : theme.inkMuted}
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
