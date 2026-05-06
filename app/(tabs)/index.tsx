// Onglet Accueil = feed social pull-based ranked (cf. migration 0051_get_feed).
// Header = avatar + barre de recherche. Tap sur la barre → la zone du flux
// bascule en mode Discover (recommandations si vide, résultats si query).
// Tap "Annuler" ou clear + blur → retour au feed.

import { DiscoverList } from "@/components/feed/discover-list";
import { FeedItemFrame } from "@/components/feed/feed-item-frame";
import { FeedSearchHeader } from "@/components/feed/feed-search-header";
import { RepostWrapper } from "@/components/feed/repost-wrapper";
import { renderFeedItemBody } from "@/components/feed/render-feed-body";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Feed } from "@grimolia/social";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function FeedScreen() {
  const themeInk = usePreferences((s) => s.colorSecondary);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const searchInputRef = useRef<TextInput | null>(null);

  const feedQuery = Feed.useFeed();
  const entries = feedQuery.data?.pages.flat() ?? [];

  const cancelSearch = () => {
    setSearchQuery("");
    setSearchActive(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const showDiscover = searchActive || searchQuery.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top"]}>
      <FeedSearchHeader
        query={searchQuery}
        onQueryChange={setSearchQuery}
        active={showDiscover}
        onActivate={() => setSearchActive(true)}
        onCancel={cancelSearch}
        inputRef={searchInputRef}
      />

      {showDiscover ? (
        <DiscoverList query={searchQuery} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <FeedItem entry={item} />}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 32,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          ListEmptyComponent={
            feedQuery.isLoading ? (
              <View className="mt-12 items-center">
                <ActivityIndicator color={themeInk} />
              </View>
            ) : (
              <FeedEmptyState />
            )
          }
          ListFooterComponent={
            feedQuery.isFetchingNextPage ? (
              <View className="mt-4 items-center">
                <ActivityIndicator color={themeInk} />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
              void feedQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={feedQuery.isRefetching && !feedQuery.isFetchingNextPage}
              onRefresh={() => void feedQuery.refetch()}
              tintColor={themeInk}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function FeedEmptyState() {
  return (
    <View className="mt-16 items-center px-6">
      <MaterialIcons name="dynamic-feed" size={48} color="#c9bfb1" />
      <Text className="mt-4 text-center font-display text-xl text-ink">
        Le feed est vide
      </Text>
      <Text className="mt-2 text-center text-base text-ink-muted">
        Suis des lecteurs ou publie une fiche pour voir l'activité ici.
      </Text>
    </View>
  );
}

function FeedItem({ entry }: { entry: Feed.FeedEntry }) {
  // Repost : on délègue au wrapper qui rend la SOURCE (engagement non
  // fragmenté, cf. spec). La row repost ne porte rien d'affichable
  // directement.
  if (entry.verb === "reposted") {
    return <RepostWrapper repostEntry={entry} />;
  }
  const body = renderFeedItemBody(entry);
  if (!body) return null;
  return <FeedItemFrame entry={entry} body={body} />;
}
