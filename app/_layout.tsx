import '@/global.css';

import { useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initNetworkWatcher } from '@/lib/sync/network';
import { pullUserData } from '@/lib/sync/pull';
import { flushQueue } from '@/lib/sync/queue';
import { resetAllStores } from '@/lib/sync/reset';
import { setSyncUserId } from '@/lib/sync/session';
import { useProfile } from '@/store/profile';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 1000 * 60 * 5, retry: 1 },
        },
      }),
  );
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fbf8f4',
        }}>
        <ActivityIndicator color="#c27b52" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthGate />
          <StatusBar style="auto" />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);
  const username = useProfile((s) => s.username);

  // Surveillance online/offline (une fois, au mount)
  useEffect(() => initNetworkWatcher(), []);

  useEffect(() => {
    if (loading) return;
    const onSignInScreen = segments[0] === 'sign-in';
    if (!session && !onSignInScreen) {
      router.replace('/sign-in');
    } else if (session && onSignInScreen) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  // Gate complete-profile : si connecté mais pas de username → force la saisie
  useEffect(() => {
    if (loading || syncing || !session) return;
    const onCompleteScreen = segments[0] === 'complete-profile';
    if (!username && !onCompleteScreen) {
      router.replace('/complete-profile');
    } else if (username && onCompleteScreen) {
      router.replace('/');
    }
  }, [session, username, loading, syncing, segments, router]);

  useEffect(() => {
    if (loading) return;
    const currentId = session?.user.id ?? null;
    const previousId = lastUserIdRef.current;

    if (currentId && currentId !== previousId) {
      lastUserIdRef.current = currentId;
      setSyncing(true);
      // 1) Flusher la queue offline (envoyer ce qui n'avait pas pu partir)
      // 2) Puis pull (avoir la vérité serveur à jour)
      // 3) Activer la sync auto des écritures courantes
      (async () => {
        try {
          await flushQueue();
          await pullUserData(currentId);
        } catch (err) {
          console.warn('[sync] login sync failed', err);
        } finally {
          setSyncUserId(currentId);
          setSyncing(false);
        }
      })();
    } else if (!currentId && previousId) {
      lastUserIdRef.current = null;
      setSyncUserId(null);
      resetAllStores();
    }
  }, [session, loading]);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#fbf8f4' },
          headerTintColor: '#1a1410',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="complete-profile" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="book/[isbn]" options={{ title: 'Livre', headerBackTitle: 'Retour' }} />
        <Stack.Screen
          name="library"
          options={{ title: 'Ma bibliothèque', headerBackTitle: 'Retour' }}
        />
        <Stack.Screen
          name="book-manual"
          options={{ title: 'Saisie manuelle', headerBackTitle: 'Retour' }}
        />
        <Stack.Screen
          name="sheet/new"
          options={{ title: 'Nouvelle fiche', headerBackTitle: 'Retour' }}
        />
        <Stack.Screen
          name="sheet/[isbn]"
          options={{ title: 'Fiche de lecture', headerBackTitle: 'Retour' }}
        />
      </Stack>

      {(loading || syncing) && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fbf8f4',
          }}>
          <ActivityIndicator color="#c27b52" />
          {syncing && (
            <Text style={{ marginTop: 16, color: '#6b6259', fontSize: 14 }}>
              Synchronisation…
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
