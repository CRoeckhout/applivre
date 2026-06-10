import { HapticTab } from '@/components/haptic-tab';
import { PersonalizationSheet } from '@/components/personalization-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { derivePalette } from '@/lib/theme/colors';
import { useOnline } from '@/store/network';
import { usePreferences } from '@/store/preferences';
import { useScanBatch } from '@/store/scan-batch';
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, View } from 'react-native';

export default function TabLayout() {
  const primary = usePreferences((s) => s.colorPrimary);
  const secondary = usePreferences((s) => s.colorSecondary);
  const bg = usePreferences((s) => s.colorBg);
  const isOnline = useOnline();

  const tabColors = useMemo(() => {
    const p = derivePalette(primary, secondary, bg);
    const toRgb = (triplet: string) => `rgb(${triplet.split(' ').join(',')})`;
    return {
      active: toRgb(p['--color-accent']),
      inactive: toRgb(p['--color-ink-muted']),
      bg: toRgb(p['--color-paper']),
      border: toRgb(p['--color-paper-shade']),
    };
  }, [primary, secondary, bg]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: tabColors.active,
          tabBarInactiveTintColor: tabColors.inactive,
          tabBarStyle: {
            backgroundColor: tabColors.bg,
            borderTopColor: tabColors.border,
          },
          headerShown: false,
          tabBarButton: HapticTab,
        }}
        screenListeners={({ navigation }) => ({
          // Quitter le scanner avec une pile de scans en cours → on confirme,
          // sinon la sélection serait perdue silencieusement.
          tabPress: (e) => {
            const state = navigation.getState();
            const current = state.routes[state.index]?.name;
            if (current !== 'scanner') return;
            const target = (e.target as string | undefined)?.split('-')[0];
            if (!target || target === 'scanner') return;
            if (useScanBatch.getState().items.length === 0) return;
            e.preventDefault();
            Alert.alert(
              'Quitter le scan ?',
              'Vous allez perdre votre sélection de livres scannés.',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Quitter',
                  style: 'destructive',
                  onPress: () => {
                    useScanBatch.getState().clear();
                    navigation.navigate(target);
                  },
                },
              ],
            );
          },
        })}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Communauté',
            // Hors ligne, le feed communautaire (réseau requis) est masqué de la
            // tab bar ; l'écran redirige de toute façon vers l'accueil.
            href: isOnline ? undefined : null,
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="newspaper.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            title: 'Accueil',
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="scanner"
          options={{
            title: 'Scanner',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="barcode.viewfinder" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="sheets"
          options={{
            title: 'Fiches',
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="note.text" color={color} />,
          }}
        />
        <Tabs.Screen
          name="defi"
          options={{
            title: 'Défi',
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="flame.fill" color={color} />,
          }}
        />
      </Tabs>

      <PersonalizationSheet />
    </View>
  );
}
