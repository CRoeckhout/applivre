// Page profil publique d'un utilisateur. Header = UserCard rich
// (cadre photo + fond + badges + chip premium + police perso de l'utilisateur
// + bouton Suivre intégré). Sous le header : la liste de ses fiches publiques.
//
// Si on consulte son propre profil : pas de bouton Suivre (UserCard le gère).

import {
  PublicSheetListItem,
  type PublicSheetListItemRow,
} from "@/components/public-sheet-list-item";
import { UserCard } from "@/components/user-card";
import { supabase } from "@/lib/supabase";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Follows, useProfile } from "@grimolia/social";
import { useQuery } from "@tanstack/react-query";
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

  const profileQuery = useProfile(userId);

  // Compteurs pour la grille de stats du UserCard. UserCard gère le bouton
  // Suivre lui-même via Follows.useToggleFollow — on n'a plus à le faire ici.
  const followerCount = Follows.useFollowerCount(userId);
  const followingCount = Follows.useFollowingCount(userId);

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

  const followers = followerCount.data ?? 0;
  const following = followingCount.data ?? 0;
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
        <UserCard
          variant="rich"
          userId={userId!}
          // Pas de navigation : on est déjà sur la page profil de cet user.
          onPress={() => {}}
          stats={[
            {
              label: followers > 1 ? "abonnés" : "abonné",
              value: followers,
            },
            {
              label: "abonnements",
              value: following,
            },
          ]}
        />

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
            <EmptySheetsState userId={userId!} />
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

function EmptySheetsState({ userId }: { userId: string }) {
  // Texte différent selon qu'on consulte son propre profil ou celui d'un autre.
  // useProfile garde la cache, on relit auth pour savoir si on est self.
  return (
    <Text className="text-sm text-ink-muted">
      Aucune fiche publique pour l'instant.
    </Text>
  );
}
