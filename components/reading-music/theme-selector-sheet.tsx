import { listMusicThemes, type MusicTheme } from '@/lib/reading-music/api';
import { useReadingMusicStore } from '@/store/reading-music';
import { usePremium } from '@/store/premium';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

type Props = {
  open: boolean;
  onClose: () => void;
  // Déclenché quand un user non-premium tape un thème : le parent ouvre la
  // PremiumPaywallModal au lieu d'activer le thème.
  onPaywallRequested: () => void;
};

// Bottom-sheet listant les thèmes de musique disponibles. Visible aussi par
// les non-premium (ils voient les noms de thèmes), mais le tap déclenche le
// paywall via `onPaywallRequested`. Premium → set le thème + ferme la sheet.
export function ThemeSelectorSheet({ open, onClose, onPaywallRequested }: Props) {
  const isPremium = usePremium((s) => s.isPremium);
  const selectedKey = useReadingMusicStore((s) => s.selectedThemeKey);
  const setTheme = useReadingMusicStore((s) => s.setTheme);

  const [themes, setThemes] = useState<MusicTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMusicThemes()
      .then((list) => {
        if (cancelled) return;
        setThemes(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Erreur inconnue');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function onPickTheme(theme: MusicTheme) {
    if (!isPremium) {
      onClose();
      onPaywallRequested();
      return;
    }
    setTheme(theme.key);
    onClose();
  }

  function onPickNone() {
    setTheme(null);
    onClose();
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60"
        style={{ justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl bg-paper px-5 pt-5 pb-8"
          style={{ maxHeight: '75%' }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="font-display text-lg text-ink">
              Ambiance sonore
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade"
            >
              <MaterialIcons name="close" size={18} color="rgb(58 50 43)" />
            </Pressable>
          </View>

          {!isPremium && (
            <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-accent-pale px-3 py-2">
              <MaterialIcons name="star" size={16} color="#f59e0b" />
              <Text className="flex-1 text-xs text-ink">
                Réservé aux abonnés Premium. Tap un thème pour en savoir plus.
              </Text>
            </View>
          )}

          <ScrollView style={{ marginTop: 16 }} showsVerticalScrollIndicator={false}>
            {loading && (
              <View className="py-8" style={{ alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            )}

            {error && (
              <Text className="py-4 text-center text-sm text-[#c8322a]">
                {error}
              </Text>
            )}

            {!loading && !error && (
              <View className="gap-2">
                <ThemeRow
                  label="Aucune"
                  active={selectedKey === null}
                  onPress={onPickNone}
                  icon="volume-off"
                />
                {themes.map((t) => (
                  <ThemeRow
                    key={t.id}
                    label={t.displayName}
                    active={selectedKey === t.key}
                    onPress={() => onPickTheme(t)}
                    locked={!isPremium}
                  />
                ))}
                {themes.length === 0 && (
                  <Text className="py-4 text-center text-sm text-ink-muted">
                    Aucun thème disponible.
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ThemeRow({
  label,
  active,
  onPress,
  locked,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  locked?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 active:opacity-80 ${
        active ? 'bg-ink' : 'bg-paper-warm'
      }`}
    >
      {icon && (
        <MaterialIcons
          name={icon}
          size={18}
          color={active ? 'rgb(245 240 230)' : 'rgb(58 50 43)'}
        />
      )}
      <Text
        className={`flex-1 font-sans-med text-base ${
          active ? 'text-paper' : 'text-ink'
        }`}
      >
        {label}
      </Text>
      {locked && <MaterialIcons name="lock-outline" size={16} color="#f59e0b" />}
      {active && (
        <MaterialIcons
          name="check"
          size={18}
          color="rgb(245 240 230)"
        />
      )}
    </Pressable>
  );
}
