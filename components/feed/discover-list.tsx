// Panneau de découverte rendu sous le header quand la barre de recherche est
// active. Si la query est non-vide → résultats du search par username. Sinon
// → liste des utilisateurs recommandés (top par follower_count, exclut self
// et déjà-suivis).

import { DiscoverUserRow } from "@/components/feed/discover-user-row";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import { Discover } from "@grimolia/social";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Text,
  View,
} from "react-native";

export function DiscoverList({ query }: { query: string }) {
  const themeInk = usePreferences((s) => s.colorSecondary);

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  const searchQuery = Discover.useSearchUsers(trimmed);
  const recommendQuery = Discover.useRecommendedUsers();

  const active = isSearching ? searchQuery : recommendQuery;
  const data = active.data ?? [];
  const isLoading = active.isLoading;

  return (
    <FlatList
      data={data}
      keyExtractor={(u) => u.id}
      renderItem={({ item }) => <DiscoverUserRow user={item} />}
      ListHeaderComponent={
        <Text
          style={{
            fontSize: 12,
            fontWeight: "500",
            color: hexWithAlpha(themeInk, 0.6),
            marginBottom: 4,
            paddingHorizontal: 4,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {isSearching ? "Résultats" : "Recommandations"}
        </Text>
      }
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 32,
      }}
      ItemSeparatorComponent={() => (
        <View
          style={{
            height: 1,
            backgroundColor: hexWithAlpha(themeInk, 0.06),
            marginLeft: 60,
          }}
        />
      )}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
      ListEmptyComponent={
        isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={themeInk} />
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text
              style={{
                fontSize: 13,
                color: hexWithAlpha(themeInk, 0.6),
                textAlign: "center",
              }}
            >
              {isSearching
                ? `Aucun utilisateur trouvé pour « ${trimmed} ».`
                : "Pas encore de recommandations."}
            </Text>
          </View>
        )
      }
    />
  );
}
