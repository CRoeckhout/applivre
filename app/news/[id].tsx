// Écran détail d'un post du fil d'actualité éditorial (annonces / promos).
// Atteint depuis une carte éditoriale sans cible (refKind null). Les posts
// avec cible (feed_entry / book / sheet) routent ailleurs (cf. editorialHref).
//
// Mise en page : hero immersif reprenant le rendu de la bannière « À la une »
// (chip + titre superposés sur l'image avec dégradé), puis le body (blocs)
// en dessous. Bouton retour flottant au-dessus du hero.

import {
  FondPanel,
  usePaperScreenClass,
} from "@/components/app-fond-background";
import {
  GradientScrim,
  KIND_LABELS,
} from "@/components/editorial/editorial-card";
import { ReleaseNoteBlocks } from "@/components/release-notes/block-renderer";
import { RichText } from "@/components/rich-text";
import { useEditorialPost } from "@/lib/editorial/hooks";
import { useState } from "react";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link, useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NewsDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : null;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const paperScreen = usePaperScreenClass();
  // Hauteur mesurée du bloc texte du hero → sert à dimensionner l'image (en px)
  // pour qu'elle couvre safe area + texte sans se répéter. 120 = défaut avant
  // première mesure.
  const [heroTextH, setHeroTextH] = useState(120);

  const postQuery = useEditorialPost(id);
  const post = postQuery.data ?? null;

  function openCta(deeplink: string) {
    if (deeplink.startsWith("/")) router.push(deeplink as Href);
    else void Linking.openURL(deeplink);
  }

  return (
    <View className={`flex-1 ${paperScreen}`}>
      {postQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={themeInk} />
        </View>
      ) : !post ? (
        <NotFoundState />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {post.coverUrl ? (
            // Hero immersif : l'image couvre TOUTE la zone (barre d'état
            // incluse, en absoluteFill) ; le `paddingTop = inset` réserve la
            // hauteur de la safe area pour que le texte (chip/titre) reste
            // SOUS la barre d'état. `minHeight` garde une bande visuelle même
            // pour un titre court ; `justifyContent:flex-end` colle le texte
            // en bas.
            <View className="bg-ink">
              {/* Image de fond à hauteur EXPLICITE EN PIXELS (= safe area +
                  hauteur mesurée du texte). Une hauteur en `%`/`absoluteFill`
                  contre un parent à hauteur auto faisait RÉPÉTER l'image
                  (expo-image tile verticalement). Le texte (absolu, ancré en
                  bas) est mesuré via onLayout → l'image fait juste la bonne
                  hauteur, et le texte reste sous la barre d'état. */}
              <Image
                source={{ uri: post.coverUrl }}
                style={{ width: "100%", height: insets.top + heroTextH }}
                contentFit="cover"
                transition={150}
              />
              <GradientScrim />
              <View
                onLayout={(e) => {
                  const h = Math.round(e.nativeEvent.layout.height);
                  setHeroTextH((prev) => (prev === h ? prev : h));
                }}
                className="gap-1.5 p-4"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingBottom: 18,
                  // Dégage la flèche retour (haut-gauche) : left(12)+largeur(40)+marge.
                  paddingLeft: 56,
                }}
              >
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
                  className="font-display text-2xl text-white"
                >
                  {post.title}
                </RichText>
                {post.subtitle ? (
                  <RichText
                    className="text-sm text-white/85"
                    style={{ lineHeight: 19 }}
                  >
                    {post.subtitle}
                  </RichText>
                ) : null}
              </View>
            </View>
          ) : (
            // Sans image : pas de hero pour couvrir la safe area → le header
            // texte la respecte lui-même (inset safe-area + hauteur du bouton
            // retour). Le hero AVEC image, lui, reste plein cadre (immersif,
            // sous la barre d'état).
            <FondPanel className="px-4" style={{ marginTop: insets.top + 56 }}>
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
                className="mt-1.5 font-display text-2xl text-ink"
              >
                {post.title}
              </RichText>
              {post.subtitle ? (
                <RichText
                  className="mt-1 text-sm text-ink-muted"
                  style={{ lineHeight: 19 }}
                >
                  {post.subtitle}
                </RichText>
              ) : null}
            </FondPanel>
          )}

          <FondPanel className="mt-4 px-4">
            {post.body.length > 0 ? (
              <ReleaseNoteBlocks blocks={post.body} />
            ) : null}

            {post.cta ? (
              <Pressable
                onPress={() => openCta(post.cta!.deeplink)}
                className="mt-6 items-center rounded-full bg-accent px-6 py-3 active:opacity-80"
              >
                <Text className="font-sans-med text-base text-paper">
                  {post.cta.label}
                </Text>
              </Pressable>
            ) : null}
          </FondPanel>
        </ScrollView>
      )}

      {/* Bouton retour flottant : lisible sur le hero (cercle sombre) comme sur
          le fond papier une fois scrollé. */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={{
          position: "absolute",
          top: insets.top + 6,
          left: 12,
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
        className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
      >
        <MaterialIcons name="arrow-back" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

function NotFoundState() {
  const themeInk = usePreferences((s) => s.colorSecondary);
  return (
    <View className="flex-1 items-center justify-center px-8">
      <MaterialIcons name="visibility-off" size={36} color={themeInk} />
      <Text className="mt-3 font-display text-2xl text-ink">
        Actualité introuvable
      </Text>
      <Text className="mt-2 text-center text-ink-muted">
        Cette publication n'est plus disponible.
      </Text>
      <Link href="/(tabs)" asChild>
        <Pressable className="mt-6 rounded-full border border-ink px-6 py-2.5 active:opacity-70">
          <Text className="font-sans-med text-ink">Retour à l'accueil</Text>
        </Pressable>
      </Link>
    </View>
  );
}
