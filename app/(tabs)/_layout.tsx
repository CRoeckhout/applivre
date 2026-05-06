import { HapticTab } from '@/components/haptic-tab';
import { PersonalizationSheet } from '@/components/personalization-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { derivePalette } from '@/lib/theme/colors';
import { usePreferences } from '@/store/preferences';
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';

export default function TabLayout() {
  const primary = usePreferences((s) => s.colorPrimary);
  const secondary = usePreferences((s) => s.colorSecondary);
  const bg = usePreferences((s) => s.colorBg);

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
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Accueil',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="newspaper.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            title: 'Chez moi',
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
          name="defi"
          options={{
            title: 'Défi',
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="flame.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
          }}
        />
      </Tabs>

      <PersonalizationSheet />
    </View>
  );
}
