import type { EditorialPost } from "@/types/editorial";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { EditorialCard } from "./editorial-card";

// Durée d'affichage d'un item avant défilement auto. La barre de progression
// se remplit sur cette durée ; quand elle atteint 100 %, on avance.
const ADVANCE_MS = 6000;

// Hauteur fixe de la bannière : tous les items la partagent — « même hauteur »
// en pur style, sans mesure runtime. L'image en overlay remplit toute la
// hauteur ; le contenu au-delà est rogné (carte en overflow-hidden). Seul
// chiffre à ajuster pour une bannière plus/moins haute. Réutilisé par le hero
// de /news/[id] pour garder la même hauteur que la carte.
export const BANNER_HEIGHT = 120;

// Gap latéral entre deux bannières. Implémenté en padding horizontal sur le
// wrapper d'item (qui garde la largeur de page pleine pour ne pas casser le
// paging) : la card est insérée de CARD_GAP/2 de chaque côté → gap complet
// entre deux cartes, demi-gap aux bords du carrousel.
const CARD_GAP = 12;

// Bannière « À la une » : posts éditoriaux épinglés, en tête de l'onglet
// Communauté. Chaque item occupe 100 % de la largeur disponible (paging, pas
// d'aperçu des voisins). Défilement auto piloté par une barre de progression,
// pagination par points (tappables) en bas.
export function FeaturedCarousel({ posts }: { posts: EditorialPost[] }) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // Doigt posé sur la bannière → timer en pause ; relâcher reprend là où la
  // progression s'était arrêtée (cf. handlers touch autour de la FlatList).
  const [paused, setPaused] = useState(false);
  const listRef = useRef<FlatList<EditorialPost>>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const count = posts.length;

  // Clamp si la liste rétrécit (un post dépublié, par ex.).
  useEffect(() => {
    if (activeIndex > count - 1) setActiveIndex(Math.max(0, count - 1));
  }, [count, activeIndex]);

  // Reset de la progression à chaque changement d'item (auto, swipe ou dot) —
  // déclaré AVANT l'effet du timer pour s'exécuter en premier.
  useEffect(() => {
    progress.setValue(0);
  }, [activeIndex, progress]);

  // La barre de progression EST le timer : elle se remplit sur ADVANCE_MS,
  // et à 100 % on avance d'un item (avec boucle). Pause : le cleanup stoppe
  // l'anim (la valeur reste figée) ; à la reprise on repart de la valeur
  // courante avec la durée restante au prorata.
  useEffect(() => {
    if (count <= 1 || width === 0 || paused) return;
    let cancelled = false;
    let anim: Animated.CompositeAnimation | undefined;
    progress.stopAnimation((current) => {
      if (cancelled) return;
      anim = Animated.timing(progress, {
        toValue: 1,
        duration: ADVANCE_MS * Math.max(0, 1 - current),
        useNativeDriver: false,
      });
      anim.start(({ finished }) => {
        if (!finished) return;
        const next = (activeIndex + 1) % count;
        listRef.current?.scrollToOffset({ offset: next * width, animated: true });
        setActiveIndex(next);
      });
    });
    return () => {
      cancelled = true;
      anim?.stop();
    };
  }, [activeIndex, count, width, progress, paused]);

  function goToIndex(i: number) {
    if (i === activeIndex || width === 0) return;
    listRef.current?.scrollToOffset({ offset: i * width, animated: true });
    setActiveIndex(i);
  }

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width === 0) return;
    // Filet de sécurité : si le onTouchEnd a été avalé par le scroll, on
    // dé-pause à la fin du geste.
    setPaused(false);
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== activeIndex && i >= 0 && i < count) setActiveIndex(i);
  }

  // Appui long sur une carte : no-op passé aux Pressable des cartes pour
  // qu'un maintien (pause de lecture) ne déclenche PAS la navigation au
  // relâchement — seul un tap bref navigue.
  const swallowLongPress = () => {};

  if (count === 0) return null;

  return (
    <View
      className="mb-3"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <>
          {/* Doigt posé n'importe où sur la bannière → pause du défilement
              auto ; relâcher (ou fin de swipe) reprend. */}
          <View
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
            onTouchCancel={() => setPaused(false)}
          >
            <FlatList
              ref={listRef}
              data={posts}
              keyExtractor={(p) => p.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumScrollEnd}
              getItemLayout={(_, index) => ({
                length: width,
                offset: width * index,
                index,
              })}
              extraData={activeIndex}
              renderItem={({ item, index }) => (
                <View style={{ width, paddingHorizontal: CARD_GAP / 2 }}>
                  <EditorialCard
                    post={item}
                    variant="carousel"
                    height={BANNER_HEIGHT}
                    progress={count > 1 && index === activeIndex ? progress : undefined}
                    onLongPress={swallowLongPress}
                  />
                </View>
              )}
            />
          </View>

          {count > 1 && (
            <View className="mt-2 flex-row justify-center" style={{ gap: 6 }}>
              {posts.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => goToIndex(i)}
                  hitSlop={6}
                >
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
