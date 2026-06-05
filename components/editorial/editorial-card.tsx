import { RichText } from "@/components/rich-text";
import {
  editorialHref,
  type EditorialPost,
  type EditorialPostKind,
} from "@/types/editorial";
import { CardProgressBar } from "./card-progress-bar";
import { FeaturedBookCard } from "./featured-book-card";
import { FeaturedReviewCard } from "./featured-review-card";
import { FeaturedSheetCard } from "./featured-sheet-card";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useId } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export const KIND_LABELS: Record<EditorialPostKind, string> = {
  announcement: "Actualité",
  partner: "Partenaire",
  featured_review: "Avis à la une",
  book_of_month: "Livre du mois",
  featured_sheet: "Fiche à la une",
};

// Hauteur des cartes feed en mode superposé (texte sur l'image). Le carrousel
// « À la une » reçoit sa hauteur du parent ; le feed n'en a pas → on en impose
// une pour que l'image remplisse et que le texte se pose en bas.
const FEED_OVERLAY_HEIGHT = 120;

// Carte d'un post éditorial.
//   variant 'carousel' : bannière. Avec image → texte superposé sur l'image
//     (dégradé bas pour lisibilité). Sans image → texte sur fond papier.
//   variant 'feed'     : carte pleine largeur intercalée dans le feed
//     (image au-dessus, texte dessous).
// Le tap route selon la nature de la cible (editorialHref).
export function EditorialCard({
  post,
  variant = "feed",
  height,
  progress,
  onLongPress,
}: {
  post: EditorialPost;
  variant?: "carousel" | "feed";
  // En bannière, le parent impose une hauteur commune (la plus grande des
  // items) pour que la bannière ne saute pas au défilement.
  height?: number;
  // En bannière, le carrousel passe sa progression (0→1) à la SEULE carte
  // active : la barre est alors rendue dans la card et clippée par son radius.
  progress?: Animated.Value;
  // En bannière : no-op qui avale l'appui long (maintien = pause du carrousel,
  // le relâchement ne doit pas naviguer — seul un tap bref navigue).
  onLongPress?: () => void;
}) {
  const router = useRouter();
  const isCarousel = variant === "carousel";

  // Livre du mois : texte à gauche + couverture du livre à droite, plutôt
  // que l'image en pleine largeur du layout générique.
  if (post.kind === "book_of_month" && post.refKind === "book" && post.refId) {
    return (
      <FeaturedBookCard
        post={post}
        height={isCarousel ? height : undefined}
        progress={isCarousel ? progress : undefined}
        onLongPress={onLongPress}
      />
    );
  }

  // Avis mis en avant (hors bannière) : template dédié note + avis tronqué.
  // Couvre le ref direct (review_id) ET la publication promue (feed_entry).
  if (
    !isCarousel &&
    post.kind === "featured_review" &&
    (post.reviewId || (post.refKind === "feed_entry" && post.refId))
  ) {
    return <FeaturedReviewCard post={post} />;
  }

  // Fiche mise en avant : preview de la fiche (comme dans la liste des
  // fiches). En feed → chip au-dessus ; en bannière → preview pleine carte
  // (hauteur du carrousel + barre de progression). Couvre le ref direct
  // (sheet) ET la publication promue (feed_entry).
  if (
    post.kind === "featured_sheet" &&
    post.refId &&
    (post.refKind === "sheet" || post.refKind === "feed_entry")
  ) {
    return (
      <FeaturedSheetCard
        post={post}
        height={isCarousel ? height : undefined}
        progress={isCarousel ? progress : undefined}
        onLongPress={onLongPress}
      />
    );
  }

  // Texte superposé sur l'image dès qu'il y a une couverture, en bannière comme
  // dans le feed (même layout « À la une »). Sans image → layout texte sur fond.
  const overlay = !!post.coverUrl;
  const snippet = post.subtitle;
  const go = () => router.push(editorialHref(post) as Href);

  // ─── Avec image : texte superposé (bannière ou feed) ───
  if (overlay) {
    return (
      <Pressable
        onPress={go}
        onLongPress={onLongPress}
        style={{ width: "100%", height: height ?? FEED_OVERLAY_HEIGHT }}
        className="overflow-hidden rounded-2xl border border-accent/30 bg-ink active:opacity-90"
      >
        <Image
          source={{ uri: post.coverUrl! }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
        <GradientScrim />
        <View className="flex-1 justify-end gap-1.5 p-3.5">
          <View className="flex-row items-center gap-1.5">
            <View
              style={{ width: 5, height: 5, borderRadius: 3 }}
              className="bg-white"
            />
            <Text className="font-sans-semi text-[11px] uppercase tracking-wide text-white/90">
              {KIND_LABELS[post.kind]}
            </Text>
          </View>
          <RichText
            font="display"
            className="font-display text-lg text-white"
            numberOfLines={2}
          >
            {post.title}
          </RichText>
          {snippet ? (
            <RichText
              className="text-sm text-white/80"
              numberOfLines={2}
              style={{ lineHeight: 19 }}
            >
              {snippet}
            </RichText>
          ) : null}
          {post.cta ? (
            <Text className="mt-1 font-sans-med text-sm text-white">
              {post.cta.label} →
            </Text>
          ) : null}
        </View>
        {progress ? <CardProgressBar progress={progress} overlay /> : null}
      </Pressable>
    );
  }

  // ─── Layout standard : image au-dessus, texte dessous ───
  return (
    <Pressable
      onPress={go}
      onLongPress={onLongPress}
      style={isCarousel ? { width: "100%", height } : undefined}
      className="overflow-hidden rounded-2xl border border-accent/30 bg-paper-warm active:opacity-80"
    >
      {post.coverUrl ? (
        <Image
          source={{ uri: post.coverUrl }}
          style={{ width: "100%", height: isCarousel ? 160 : 168 }}
          contentFit="cover"
          transition={150}
        />
      ) : null}

      <View
        className={`gap-1.5 p-3.5 ${isCarousel ? "flex-1 justify-center" : ""}`}
      >
        <View className="flex-row items-center gap-1.5">
          <View
            style={{ width: 5, height: 5, borderRadius: 3 }}
            className="bg-accent"
          />
          <Text className="font-sans-semi text-[11px] uppercase tracking-wide text-accent">
            {KIND_LABELS[post.kind]}
          </Text>
        </View>

        <RichText
          font="display"
          className="font-display text-base text-ink"
          numberOfLines={2}
        >
          {post.title}
        </RichText>

        {snippet ? (
          <RichText
            className="text-sm text-ink-muted"
            numberOfLines={isCarousel ? 2 : 3}
            style={{ lineHeight: 19 }}
          >
            {snippet}
          </RichText>
        ) : null}

        {post.cta ? (
          <Text className="mt-1 font-sans-med text-sm text-accent-deep">
            {post.cta.label} →
          </Text>
        ) : null}
      </View>
      {progress ? (
        <CardProgressBar progress={progress} overlay={false} />
      ) : null}
    </Pressable>
  );
}

// Dégradé transparent → sombre vers le bas, pour rendre le texte lisible
// par-dessus n'importe quelle image. SVG (react-native-svg) car
// expo-linear-gradient n'est pas installé. Réutilisé par le hero de /news/[id].
export function GradientScrim() {
  const id = useId();
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={0} />
          <Stop offset="0.5" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.82} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
