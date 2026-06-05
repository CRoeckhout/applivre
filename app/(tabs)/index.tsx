// Onglet Accueil = feed social pull-based ranked (cf. migration 0051_get_feed).
// Header = avatar + barre de recherche. Tap sur la barre → la zone du flux
// bascule en mode Discover (recommandations si vide, résultats si query).
// Tap "Annuler" ou clear + blur → retour au feed.

import { EditorialCard } from "@/components/editorial/editorial-card";
import { FeaturedCarousel } from "@/components/editorial/featured-carousel";
import { DiscoverList } from "@/components/feed/discover-list";
import { FeedItemFrame } from "@/components/feed/feed-item-frame";
import { FeedSearchHeader } from "@/components/feed/feed-search-header";
import { RepostWrapper } from "@/components/feed/repost-wrapper";
import { renderFeedItemBody } from "@/components/feed/render-feed-body";
import { useEditorialFeed } from "@/lib/editorial/hooks";
import { useOnline } from "@/store/network";
import { usePreferences } from "@/store/preferences";
import type { EditorialPost } from "@/types/editorial";
import { MaterialIcons } from "@expo/vector-icons";
import { Feed } from "@grimolia/social";
import { Redirect } from "expo-router";
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
  const isOnline = useOnline();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const searchInputRef = useRef<TextInput | null>(null);

  const feedQuery = Feed.useFeed();
  const entries = feedQuery.data?.pages.flat() ?? [];

  // Fil éditorial (cf. lib/editorial). Les posts épinglés alimentent le
  // carrousel « À la une » en tête ; le reste est intercalé dans le feed.
  const editorialQuery = useEditorialFeed();
  const editorialPosts = editorialQuery.data ?? [];
  const pinnedPosts = editorialPosts.filter((p) => p.pinned);
  const inlinePosts = editorialPosts.filter((p) => !p.pinned);
  const listItems = buildFeedItems(entries, inlinePosts);

  const cancelSearch = () => {
    setSearchQuery("");
    setSearchActive(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const showDiscover = searchActive || searchQuery.length > 0;

  // Le feed communautaire nécessite le réseau : hors ligne on bascule sur
  // l'accueil (données locales), au lieu d'afficher un écran vide.
  if (!isOnline) return <Redirect href="/home" />;

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
          data={listItems}
          keyExtractor={(it) => it.key}
          renderItem={({ item }) =>
            item.type === "feed" ? (
              <FeedItem entry={item.entry} />
            ) : (
              <EditorialCard post={item.post} variant="feed" />
            )
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 32,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          ListHeaderComponent={
            pinnedPosts.length > 0 ? (
              <View style={{ marginBottom: 4 }}>
                <FeaturedCarousel posts={pinnedPosts} />
              </View>
            ) : null
          }
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

// Items hétérogènes du FlatList : entrées de feed organique + cartes
// éditoriales intercalées.
type FeedListItem =
  | { type: "feed"; key: string; entry: Feed.FeedEntry }
  | { type: "editorial"; key: string; post: EditorialPost };

const INTERLEAVE_EVERY = 4;

// Intercale une carte éditoriale (non épinglée) tous les INTERLEAVE_EVERY
// items du feed organique, dans l'ordre. Les posts restants (s'il y en a plus
// que de slots) sont ajoutés en fin de liste.
function buildFeedItems(
  entries: Feed.FeedEntry[],
  inlineEditorial: EditorialPost[],
): FeedListItem[] {
  const out: FeedListItem[] = [];
  let ei = 0;
  entries.forEach((entry, i) => {
    out.push({ type: "feed", key: `f-${entry.id}`, entry });
    if ((i + 1) % INTERLEAVE_EVERY === 0 && ei < inlineEditorial.length) {
      const post = inlineEditorial[ei++];
      out.push({ type: "editorial", key: `e-${post.id}`, post });
    }
  });
  while (ei < inlineEditorial.length) {
    const post = inlineEditorial[ei++];
    out.push({ type: "editorial", key: `e-${post.id}`, post });
  }
  return out;
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
