// Écran dédié à un item de feed. Affiche le FeedItemFrame en mode 'full'
// (tous les commentaires, replies dépliables inline). Atteint depuis :
//   - le lien "Voir les X commentaires" en preview
//   - le bouton "Commenter" en preview
//   - le bouton "Répondre" sous un commentaire en preview
//     → query param ?replyTo=<commentId> pour pré-régler l'input
//
// Architecture : le replyTo state vit ICI (pas dans FeedItemFrame), parce
// que la barre de saisie est rendue en footer sticky du KeyboardAvoidingView,
// au-dessus de la ScrollView, pour que le clavier la pousse correctement.
// FeedItemFrame reçoit replyTo + onReplyToChange + inputRef en props.

import { CommentInputRow } from "@/components/feed/comment-input-row";
import type { ReplyTarget } from "@/components/feed/comment-input-row";
import { FeedItemFrame } from "@/components/feed/feed-item-frame";
import { renderFeedItemBody } from "@/components/feed/render-feed-body";
import { RepostWrapper } from "@/components/feed/repost-wrapper";
import { KeyboardDismissBar } from "@/components/keyboard-dismiss-bar";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Comments, Feed, type TargetRef } from "@grimolia/social";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Marge top entre le commentaire ciblé et le haut visible de la scroll view
// après scroll. Laisse de la place pour que l'utilisateur "voie" le contexte
// au-dessus.
const SCROLL_TOP_OFFSET = 80;

export default function FeedEntryScreen() {
  const params = useLocalSearchParams<{
    entryId: string;
    replyTo?: string;
    focus?: string;
  }>();
  const entryId = params.entryId;
  const replyToParam =
    typeof params.replyTo === "string" ? params.replyTo : null;
  // focus=1 (depuis le bouton "Commenter" en preview) → on ouvre
  // l'écran avec l'input focus et le clavier déjà ouvert. Une seule fois,
  // au mount, indépendamment du replyTo.
  const focusOnMountRef = useRef(params.focus === "1");

  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);

  // Pour une row repost, l'engagement (likes/commentaires) reste attaché
  // à l'entry SOURCE — pas au repost (cf. RepostWrapper). Le target de
  // l'écran (utilisé par CommentInputRow et la query de root comments)
  // doit donc pointer sur target_id quand verb='reposted'. Tant que
  // entryQuery n'a pas chargé, on retombe sur l'id d'URL (probable
  // source dans la grande majorité des cas).
  const entryQuery = useQuery({
    queryKey: ["social", "feed", "entry", entryId],
    queryFn: () => Feed.fetchFeedEntry(entryId!),
    enabled: Boolean(entryId),
    staleTime: 1000 * 60,
  });

  const effectiveEntryId = useMemo(() => {
    const e = entryQuery.data;
    if (e && e.verb === "reposted" && e.target_id) return e.target_id;
    return entryId ?? "";
  }, [entryQuery.data, entryId]);

  const target = useMemo<TargetRef>(
    () => ({ kind: "feed_entry", id: effectiveEntryId }),
    [effectiveEntryId],
  );

  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  // Wrapper interne autour du contenu de la ScrollView. measureLayout
  // veut un host view comme cible — `ScrollView` n'en est pas un (au sens
  // qu'attend l'API), d'où l'erreur "must be called with a ref to a native
  // component". On mesure contre ce View intérieur, qui partage l'origine
  // de l'inner content de la ScrollView : la position retournée est donc
  // équivalente à un scrollOffset.
  const contentRef = useRef<View>(null);

  // Hydrate replyTo depuis le query param, dès que la liste root est dispo
  // (cache RQ partagée avec FeedItemFrame → quasi-instantané).
  const commentsQuery = Comments.useRootComments(target);
  useEffect(() => {
    if (!replyToParam || replyTo || !commentsQuery.data) return;
    const root = commentsQuery.data.find((c) => c.id === replyToParam);
    if (!root) return;
    setReplyTo({
      commentId: root.id,
      username: root.actor.username || root.actor.display_name || "anonyme",
    });
    // Léger délai pour que le clavier monte ET que CommentItem ait fait
    // son scroll-into-view : focus l'input pour le suivre.
    setTimeout(() => inputRef.current?.focus(), 200);
  }, [replyToParam, replyTo, commentsQuery.data]);


  const scrollIntoView = useCallback((node: View) => {
    const sv = scrollViewRef.current;
    const content = contentRef.current;
    if (!sv || !content) return;
    const contentHandle = findNodeHandle(content);
    if (contentHandle == null) return;
    node.measureLayout(
      contentHandle,
      (_x, y) => {
        sv.scrollTo({ y: Math.max(0, y - SCROLL_TOP_OFFSET), animated: true });
      },
      () => {},
    );
  }, []);

  // Auto-focus de l'input à l'arrivée via ?focus=1 (bouton "Commenter" en
  // preview). On attend que l'entry soit chargée — l'input n'est rendu
  // qu'à ce moment-là. Délai pour laisser la transition de navigation se
  // terminer, sinon le focus est avalé par l'animation et le clavier ne
  // s'ouvre pas.
  useEffect(() => {
    if (!focusOnMountRef.current) return;
    if (!entryQuery.data) return;
    focusOnMountRef.current = false;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [entryQuery.data]);

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <KeyboardDismissBar />
      <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={themeInk} />
        </Pressable>
        <Text className="font-display text-lg text-ink">Publication</Text>
        <View className="h-10 w-10" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {entryQuery.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={themeInk} />
          </View>
        ) : !entryQuery.data ? (
          <NotFoundState />
        ) : (
          <>
            <ScrollView
              ref={scrollViewRef}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 8,
                paddingBottom: 16,
              }}
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
            >
              <View ref={contentRef} collapsable={false}>
                <FullEntry
                  entry={entryQuery.data}
                  replyTo={replyTo}
                  onReplyToChange={setReplyTo}
                  inputRef={inputRef}
                  scrollIntoView={scrollIntoView}
                />
              </View>
            </ScrollView>
            <CommentInputRow
              target={target}
              replyTo={replyTo}
              onReplyToChange={setReplyTo}
              inputRef={inputRef}
            />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FullEntry({
  entry,
  replyTo,
  onReplyToChange,
  inputRef,
  scrollIntoView,
}: {
  entry: Feed.FeedEntry;
  replyTo: ReplyTarget | null;
  onReplyToChange: (next: ReplyTarget | null) => void;
  inputRef: React.RefObject<TextInput | null>;
  scrollIntoView: (node: View) => void;
}) {
  // Repost : on affiche le RepostWrapper (banner "@user a republié" +
  // note + source) avec full-mode forwardé pour que le FeedItemFrame
  // intérieur câble proprement replyTo / inputRef / scrollIntoView.
  if (entry.verb === "reposted") {
    return (
      <RepostWrapper
        repostEntry={entry}
        commentsMode="full"
        replyTo={replyTo}
        onReplyToChange={onReplyToChange}
        inputRef={inputRef}
        scrollIntoView={scrollIntoView}
      />
    );
  }

  const body = renderFeedItemBody(entry);
  if (!body) return null;
  return (
    <FeedItemFrame
      entry={entry}
      body={body}
      commentsMode="full"
      replyTo={replyTo}
      onReplyToChange={onReplyToChange}
      inputRef={inputRef}
      scrollIntoView={scrollIntoView}
    />
  );
}

function NotFoundState() {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center px-8">
      <MaterialIcons name="visibility-off" size={36} color={themeInk} />
      <Text className="mt-3 font-display text-2xl text-ink">
        Publication introuvable
      </Text>
      <Text className="mt-2 text-center text-ink-muted">
        Cette publication a été supprimée ou n'est plus visible pour toi.
      </Text>
      <Pressable
        onPress={() => router.back()}
        className="mt-6 rounded-full border border-ink px-6 py-2.5 active:opacity-70"
      >
        <Text className="font-sans-med text-ink">Retour</Text>
      </Pressable>
    </View>
  );
}
