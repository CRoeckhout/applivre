import "@/global.css";

import { configure as configureSocial } from "@grimolia/social";
import { supabase } from "@/lib/supabase";
import "@/lib/social-kinds";
import { ThemeProvider as AppThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useReadingLiveActivity } from "@/hooks/use-reading-live-activity";
import { initNetworkWatcher } from "@/lib/sync/network";
import { pullUserData } from "@/lib/sync/pull";
import { flushQueue } from "@/lib/sync/queue";
import { resetAllStores } from "@/lib/sync/reset";
import { setSyncUserId } from "@/lib/sync/session";
import { hexToRgb, relativeLuminance } from "@/lib/theme/colors";
import { useAvatarFrameCatalog } from "@/store/avatar-frame-catalog";
import { useBorderCatalog } from "@/store/border-catalog";
import { useFondCatalog } from "@/store/fond-catalog";
import { useFreemium } from "@/store/freemium";
import { usePremium } from "@/store/premium";
import { useStickerCatalog } from "@/store/sticker-catalog";
import { useDebug } from "@/store/debug";
import { usePreferences } from "@/store/preferences";
import { useProfile } from "@/store/profile";
import {
  Caveat_400Regular,
  Caveat_500Medium,
  Caveat_600SemiBold,
  Caveat_700Bold,
} from "@expo-google-fonts/caveat";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from "@expo-google-fonts/dm-sans";
import {
  Lora_400Regular,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_700Bold,
} from "@expo-google-fonts/lora";
import {
  Orbitron_400Regular,
  Orbitron_500Medium,
  Orbitron_600SemiBold,
  Orbitron_700Bold,
} from "@expo-google-fonts/orbitron";
import {
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from "@expo-google-fonts/space-mono";
import { UnifrakturMaguntia_400Regular } from "@expo-google-fonts/unifrakturmaguntia";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, DevSettings, Platform, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Désactive le scaling système des polices (Dynamic Type iOS / Font Size
// Android) pour TOUS les Text/TextInput de l'app. Trade-off accepté : moins
// accessibility-friendly pour les users avec dynamic type activé, mais
// indispensable pour garantir un rendu identique sur tous les devices —
// notamment côté fiche de lecture où le wrapping et la position des stickers
// dépendent de la taille effective des polices. Doit tourner avant tout
// premier render, donc au top-level du module.
type WithDefaultProps = { defaultProps?: Record<string, unknown> };
const textWithProps = Text as unknown as WithDefaultProps;
textWithProps.defaultProps = {
  ...(textWithProps.defaultProps ?? {}),
  allowFontScaling: false,
};
const textInputWithProps = TextInput as unknown as WithDefaultProps;
textInputWithProps.defaultProps = {
  ...(textInputWithProps.defaultProps ?? {}),
  allowFontScaling: false,
};
import "react-native-reanimated";
import { BadgeUnlockToastHost } from "@/components/badges/badge-unlock-toast-host";
import { useBadgeForegroundEval } from "@/hooks/use-badges";

// Injecte le client Supabase dans @grimolia/social. Le package est agnostique
// du domaine livre et reste réutilisable pour de futures apps (musique, jeux…).
configureSocial(supabase);

export const unstable_settings = {
  anchor: "(tabs)",
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
    Lora_400Regular,
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_700Bold,
    Caveat_400Regular,
    Caveat_500Medium,
    Caveat_600SemiBold,
    Caveat_700Bold,
    UnifrakturMaguntia_400Regular,
    Orbitron_400Regular,
    Orbitron_500Medium,
    Orbitron_600SemiBold,
    Orbitron_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fbf8f4",
        }}
      >
        <ActivityIndicator color="#c27b52" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <AppThemeProvider>
            <AuthGate />
            <ThemedStatusBar />
            {/* <DebugToggle /> */}
          </AppThemeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

// Choisit le style de la status bar (icônes claires vs sombres) selon la
// luminance du fond actif. Évite les icônes invisibles sur thème sombre.
function ThemedStatusBar() {
  const bg = usePreferences((s) => s.colorBg);
  const rgb = hexToRgb(bg);
  const lum = rgb ? relativeLuminance(rgb) : 1;
  const style = lum < 0.5 ? "light" : "dark";
  return <StatusBar style={style} />;
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

  // Fetch catalogs cadres et fonds : default-pour-tous + unlocks du user
  // courant. Re-fetch quand le user change pour récupérer ses unlocks.
  // Idem pour le flag premium (lié au user) ; les freemium settings sont
  // public read et ne dépendent pas du user, mais fetch dans le même effect
  // pour rester groupé avec les autres reads de bootstrap.
  useEffect(() => {
    const userId = session?.user.id ?? null;
    void useBorderCatalog.getState().fetch(userId);
    void useFondCatalog.getState().fetch(userId);
    void useStickerCatalog.getState().fetch(userId);
    void useAvatarFrameCatalog.getState().fetch(userId);
    void usePremium.getState().fetch(userId);
    void useFreemium.getState().fetch();
  }, [session]);

  // Pilote la Live Activity iOS depuis le store timer (no-op en Expo Go).
  useReadingLiveActivity();

  // Eval serveur des badges au foreground (les writers déclenchent déjà
  // une eval debouncée après chaque mutation).
  useBadgeForegroundEval();

  // Commande dans le menu dev RN (Cmd+D / shake) pour toggler les panneaux debug.
  useEffect(() => {
    if (!__DEV__) return;
    // DevSettings.addMenuItem n'existe pas sur web (Platform.OS === 'web').
    if (Platform.OS === 'web') return;
    DevSettings.addMenuItem("Toggle debug panels", () => {
      useDebug.getState().togglePanels();
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    const onSignInScreen = segments[0] === "sign-in";
    if (!session && !onSignInScreen) {
      router.replace("/sign-in");
    } else if (session && onSignInScreen) {
      router.replace("/");
    }
  }, [session, loading, segments, router]);

  // Gate complete-profile : si connecté mais pas de username → force la saisie
  useEffect(() => {
    if (loading || syncing || !session) return;
    const onCompleteScreen = segments[0] === "complete-profile";
    if (!username && !onCompleteScreen) {
      router.replace("/complete-profile");
    } else if (username && onCompleteScreen) {
      router.replace("/");
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
          console.warn("[sync] login sync failed", err);
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

  const bg = usePreferences((s) => s.colorBg);
  const ink = usePreferences((s) => s.colorSecondary);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: bg },
          headerTintColor: ink,
          contentStyle: { backgroundColor: bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen
          name="complete-profile"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
        <Stack.Screen
          name="book/[isbn]"
          options={{ title: "Livre", headerBackTitle: "Retour" }}
        />
        <Stack.Screen
          name="library"
          options={{ title: "Ma bibliothèque", headerBackTitle: "Retour" }}
        />
        <Stack.Screen name="sheets" options={{ headerShown: false }} />
        <Stack.Screen
          name="book-manual"
          options={{ title: "Saisie manuelle", headerBackTitle: "Retour" }}
        />
        <Stack.Screen
          name="sheet/new"
          options={{ title: "Nouvelle fiche", headerBackTitle: "Retour" }}
        />
        <Stack.Screen name="sheet/[isbn]" options={{ headerShown: false }} />
        <Stack.Screen name="sheet/view/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="sheet/by-book/[isbn]" options={{ headerShown: false }} />
        <Stack.Screen name="profile/[userId]" options={{ headerShown: false }} />
        <Stack.Screen name="feed/[entryId]" options={{ headerShown: false }} />
        <Stack.Screen name="messages/index" options={{ headerShown: false }} />
        <Stack.Screen name="messages/[threadId]" options={{ headerShown: false }} />
        <Stack.Screen name="bingo/index" options={{ headerShown: false }} />
        <Stack.Screen name="bingo/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="bingo/[id]/pick/[cellIndex]"
          options={{ title: 'Choisir un livre', headerBackTitle: 'Retour' }}
        />
      </Stack>

      {(loading || syncing) && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#fbf8f4",
          }}
        >
          <ActivityIndicator color="#c27b52" />
          {syncing && (
            <Text style={{ marginTop: 16, color: "#6b6259", fontSize: 14 }}>
              Synchronisation…
            </Text>
          )}
        </View>
      )}

      <BadgeUnlockToastHost />
    </View>
  );
}
