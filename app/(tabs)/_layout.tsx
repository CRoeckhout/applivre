import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#c27b52',
        tabBarInactiveTintColor: '#6b6259',
        tabBarStyle: {
          backgroundColor: '#fbf8f4',
          borderTopColor: '#e8dfce',
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="barcode.viewfinder" color={color} />,
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
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
