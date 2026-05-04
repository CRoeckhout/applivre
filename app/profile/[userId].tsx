// Page profil publique d'un utilisateur. Accessible par UUID (route stable
// même si le username change). Affiche identité publique + stats sociales +
// liste des fiches publiques. Bouton Suivre via le package @grimolia/social.
//
// Si on consulte son propre profil : pas de bouton Suivre, le bouton Éditer
// du profil reste à brancher (hors scope de cette slice).

import {
  PublicSheetListItem,
  type PublicSheetListItemRow,
} from "@/components/public-sheet-list-item";
import { useAuth } from "@/hooks/use-auth";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { supabase } from "@/lib/supabase";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Follows, useProfile } from "@grimolia/social";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

async function fetchUserSheets(
  userId: string,
): Promise<PublicSheetListItemRow[]> {
  const { data, error } = await supabase.rpc("list_public_sheets_by_user", {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data ?? []) as PublicSheetListItemRow[];
}

export default function ProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);

  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const isSelf = currentUserId !== null && currentUserId === userId;

  const profileQuery = useProfile(userId);
  const followerCount = Follows.useFollowerCount(userId);
  const followingCount = Follows.useFollowingCount(userId);
  const isFollowingQuery = Follows.useIsFollowing(currentUserId, userId);
  const toggleFollow = Follows.useToggleFollow(currentUserId);

  const sheetsQuery = useQuery({
    queryKey: ["user-public-sheets", userId],
    queryFn: () => fetchUserSheets(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60,
  });

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color={themeInk} />
      </SafeAreaView>
    );
  }

  const profile = profileQuery.data;
  if (!profile) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-paper px-8"
        edges={["top", "bottom"]}
      >
        <MaterialIcons name="person-off" size={36} color={themeInk} />
        <Text className="mt-3 font-display text-2xl text-ink">
          Profil introuvable
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-full border border-ink px-6 py-2.5 active:opacity-70"
        >
          <Text className="font-sans-med text-ink">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const displayName =
    profile.display_name || profile.username || "Anonyme";
  const handle = profile.username ? `@${profile.username}` : null;
  const isFollowing = isFollowingQuery.data ?? false;
  const sheets = sheetsQuery.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={themeInk} />
        </Pressable>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
      >
        <View className="items-center">
          <View
            className="h-24 w-24 items-center justify-center overflow-hidden rounded-full"
            style={{ backgroundColor: hexWithAlpha(themeInk, 0.08) }}
          >
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <MaterialIcons name="person" size={48} color={themeInk} />
            )}
          </View>

          <Text className="mt-4 font-display text-2xl text-ink">
            {displayName}
          </Text>
          {handle ? (
            <Text className="text-sm text-ink-muted">{handle}</Text>
          ) : null}

          <View className="mt-4 flex-row gap-6">
            <Stat
              value={followerCount.data ?? 0}
              label={
                (followerCount.data ?? 0) > 1 ? "abonnés" : "abonné"
              }
            />
            <Stat
              value={followingCount.data ?? 0}
              label="abonnements"
            />
          </View>

          {!isSelf && currentUserId ? (
            <Pressable
              onPress={() =>
                toggleFollow.mutate({
                  targetUserId: userId!,
                  next: !isFollowing,
                })
              }
              disabled={toggleFollow.isPending || isFollowingQuery.isLoading}
              className="mt-5 flex-row items-center gap-2 rounded-full px-6 py-2.5 active:opacity-80"
              style={{
                backgroundColor: isFollowing ? "transparent" : themeAccent,
                borderWidth: 1,
                borderColor: isFollowing ? themeAccent : themeAccent,
                opacity:
                  toggleFollow.isPending || isFollowingQuery.isLoading
                    ? 0.6
                    : 1,
              }}
            >
              <MaterialIcons
                name={isFollowing ? "check" : "person-add"}
                size={16}
                color={isFollowing ? themeAccent : "#fff"}
              />
              <Text
                className="font-sans-med"
                style={{ color: isFollowing ? themeAccent : "#fff" }}
              >
                {isFollowing ? "Suivi" : "Suivre"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View className="mt-10">
          <Text className="mb-3 font-display text-xl text-ink">
            Fiches publiques
            {sheets.length > 0 ? (
              <Text className="text-base text-ink-muted">
                {" · "}
                {sheets.length}
              </Text>
            ) : null}
          </Text>

          {sheetsQuery.isLoading ? (
            <ActivityIndicator color={themeInk} />
          ) : sheets.length === 0 ? (
            <Text className="text-sm text-ink-muted">
              {isSelf
                ? "Tu n'as encore publié aucune fiche. Active la publication depuis l'éditeur d'une fiche."
                : "Aucune fiche publique pour l'instant."}
            </Text>
          ) : (
            <View className="gap-3">
              {sheets.map((row) => (
                <PublicSheetListItem key={row.sheet_id} row={row} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center">
      <Text className="font-display text-xl text-ink">{value}</Text>
      <Text className="text-xs text-ink-muted">{label}</Text>
    </View>
  );
}
