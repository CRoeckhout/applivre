// Carousel des publications d'un utilisateur, affiché sur sa page profil.
//
// Chaque slide est une card de feed complète (FeedItemFrame), identique au
// flux principal — y compris l'engagement (likes, commentaires, reposts) et
// les actions. Les reposts (verb='reposted') sont délégués au RepostWrapper
// comme dans le feed.
//
// Parcours manuel (swipe horizontal, paging), pas de défilement auto : c'est
// un mur à parcourir, pas une mise en avant. Pagination infinie : on charge
// la page suivante quand on approche de la fin.

import { FeedItemFrame } from "@/components/feed/feed-item-frame";
import { renderFeedItemBody } from "@/components/feed/render-feed-body";
import { RepostWrapper } from "@/components/feed/repost-wrapper";
import { usePreferences } from "@/store/preferences";
import { Feed } from "@grimolia/social";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

// Padding intérieur du wrapper d'item. Le wrapper garde la largeur de page
// pleine (paging intact) ; la card est insérée de ces marges. Elles doivent
// être >= l'empreinte du drop-shadow de la card (shadowRadius 10 + offset 4)
// pour qu'il soit rendu À L'INTÉRIEUR de la cell : ni rogné, ni débordant sur
// les items voisins. Horizontal = aussi le demi-gap inter-cards.
const ITEM_PAD_X = 14;
const ITEM_PAD_Y = 16;

// Rendu d'une entry : repost → wrapper (rend la source), sinon frame standard.
// Identique au FeedItem du feed principal.
function PublicationItem({ entry }: { entry: Feed.FeedEntry }) {
  if (entry.verb === "reposted") {
    return (
      <RepostWrapper repostEntry={entry} commentsMode="none" fillHeight />
    );
  }
  const body = renderFeedItemBody(entry);
  if (!body) return null;
  return (
    <FeedItemFrame entry={entry} body={body} commentsMode="none" fillHeight />
  );
}

export function UserPublicationsCarousel({
  entries,
  hasNextPage,
  isFetchingNextPage,
  onEndReached,
}: {
  entries: Feed.FeedEntry[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onEndReached: () => void;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // Hauteur de référence = la plus grande card mesurée. On l'applique en
  // minHeight à toutes les cards pour égaliser les hauteurs (plancher, jamais
  // plafond → pas d'écrasement). Ne fait que croître : converge vers la plus
  // haute, y compris pour les cards chargées plus tard (batch suivant).
  const [itemHeight, setItemHeight] = useState(0);
  const listRef = useRef<FlatList<Feed.FeedEntry>>(null);

  const count = entries.length;

  function measure(h: number) {
    setItemHeight((prev) => (h > prev ? h : prev));
  }

  function goToIndex(i: number) {
    if (i === activeIndex || width === 0) return;
    listRef.current?.scrollToOffset({ offset: i * width, animated: true });
    setActiveIndex(i);
  }

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width === 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== activeIndex && i >= 0 && i < count) setActiveIndex(i);
  }

  if (count === 0) return null;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <FlatList
            ref={listRef}
            data={entries}
            keyExtractor={(e) => e.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            // Les cards ont des hauteurs variables : on aligne en haut pour
            // éviter un centrage qui ferait sauter le contenu d'un slide à
            // l'autre.
            contentContainerStyle={{ alignItems: "flex-start" }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) onEndReached();
            }}
            onEndReachedThreshold={1}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View
                  style={{
                    width: 48,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <ActivityIndicator color={themeInk} />
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View
                style={{
                  width,
                  paddingHorizontal: ITEM_PAD_X,
                  paddingVertical: ITEM_PAD_Y,
                  // minHeight = plancher égalisé ; le body en flex:1 absorbe
                  // l'espace excédentaire et cale la barre d'actions en bas.
                  minHeight: itemHeight || undefined,
                }}
                onLayout={(e) => measure(e.nativeEvent.layout.height)}
              >
                <PublicationItem entry={item} />
              </View>
            )}
          />

          {count > 1 && (
            <View className="mt-3 flex-row justify-center" style={{ gap: 6 }}>
              {entries.map((e, i) => (
                <Pressable key={e.id} onPress={() => goToIndex(i)} hitSlop={6}>
                  <View
                    style={{
                      width: i === activeIndex ? 18 : 6,
                      height: 6,
                      borderRadius: 3,
                    }}
                    className={i === activeIndex ? "bg-accent" : "bg-ink/20"}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
