// Header de l'onglet Accueil : avatar du user courant à gauche + barre de
// recherche étirée sur la largeur restante. Remplace le titre "Accueil"
// précédent. Tap sur la barre → la zone du flux bascule en mode Discover
// (recommandations si vide, résultats si query).

import { hexWithAlpha } from "@/lib/sheet-appearance";
import { useAuth } from "@/hooks/use-auth";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Messaging, useProfile } from "@grimolia/social";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { RefObject } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const AVATAR_SIZE = 38;

export function FeedSearchHeader({
  query,
  onQueryChange,
  active,
  onActivate,
  onCancel,
  inputRef,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  active: boolean;
  onActivate: () => void;
  onCancel: () => void;
  inputRef: RefObject<TextInput | null>;
}) {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const profileQuery = useProfile(currentUserId);
  const profile = profileQuery.data;
  const unreadTotal = Messaging.useUnreadTotal(currentUserId);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 8,
      }}
    >
      <Pressable
        onPress={() =>
          currentUserId
            ? router.push(`/profile/${currentUserId}`)
            : undefined
        }
        accessibilityLabel="Mon profil"
        hitSlop={4}
      >
        <View
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            overflow: "hidden",
            backgroundColor: hexWithAlpha(themeInk, 0.1),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <MaterialIcons
              name="person"
              size={Math.round(AVATAR_SIZE * 0.6)}
              color={hexWithAlpha(themeInk, 0.6)}
            />
          )}
        </View>
      </Pressable>

      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: hexWithAlpha(themeInk, 0.07),
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <MaterialIcons
          name="search"
          size={18}
          color={hexWithAlpha(themeInk, 0.55)}
        />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={onQueryChange}
          onFocus={onActivate}
          placeholder="Rechercher un utilisateur"
          placeholderTextColor={hexWithAlpha(themeInk, 0.45)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{
            flex: 1,
            fontSize: 14,
            color: themeInk,
            paddingVertical: 0,
          }}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => onQueryChange("")}
            accessibilityLabel="Effacer la recherche"
            hitSlop={6}
          >
            <MaterialIcons
              name="close"
              size={16}
              color={hexWithAlpha(themeInk, 0.55)}
            />
          </Pressable>
        ) : null}
      </View>

      {active ? (
        <Pressable
          onPress={onCancel}
          hitSlop={6}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: themeInk,
            }}
          >
            Annuler
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push("/messages")}
          hitSlop={6}
          accessibilityLabel="Messages"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons
              name="chat-bubble-outline"
              size={22}
              color={themeInk}
            />
            {unreadTotal > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  paddingHorizontal: 4,
                  backgroundColor: themeAccent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      )}
    </View>
  );
}
