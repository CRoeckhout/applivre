// Conversation 1:1. FlatList inverted des messages, KeyboardAvoidingView qui
// pousse le composer au-dessus du clavier. Realtime des INSERT pour pousser
// les nouveaux messages — gérée dans Messaging.useMessages.
//
// mark_thread_read appelé au mount + à chaque nouveau message reçu (changement
// de count avec sender autre que moi).

import { AvatarFrame } from "@/components/avatar-frame";
import { KeyboardDismissBar } from "@/components/keyboard-dismiss-bar";
import { renderFeedItemBody } from "@/components/feed/render-feed-body";
import { parseFeedShareBody } from "@/components/feed/send-to-contact-modal";
import { useAuth } from "@/hooks/use-auth";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Feed, Messaging, useProfile, type SocialProfile } from "@grimolia/social";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const HEADER_AVATAR = 32;

function timeOf(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString("fr-FR", { weekday: "short" });
  }
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function MessageThreadScreen() {
  const { threadId, other: otherParam } = useLocalSearchParams<{
    threadId: string;
    other?: string;
  }>();
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  // L'inbox est source de vérité pour les threads avec au moins 1 message.
  // Pour un thread fraîchement créé (vide), il n'apparaît pas encore dans
  // list_my_threads → on retombe sur le param `other` passé au push.
  const threadsQuery = Messaging.useThreads(currentUserId);
  const thread = useMemo(
    () => threadsQuery.data?.find((t) => t.id === threadId) ?? null,
    [threadsQuery.data, threadId],
  );
  const otherUserId = thread?.other.id ?? otherParam ?? null;
  const otherProfileQuery = useProfile(otherUserId);
  const otherProfile = thread?.other ?? otherProfileQuery.data ?? null;

  const messagesQuery = Messaging.useMessages(threadId);
  const sendMut = Messaging.useSendMessage(threadId, currentUserId);
  const markReadMut = Messaging.useMarkThreadRead(threadId);

  // Mark read au mount + dès que la liste change avec un message non-lu
  // adressé à moi. Pas d'effet en cascade : la mutation invalide les threads,
  // qui re-fetch list_my_threads → unread retombe à 0 côté inbox.
  const lastIncomingUnread = useMemo(() => {
    if (!messagesQuery.data || !currentUserId) return null;
    return messagesQuery.data.find(
      (m) => m.sender_id !== currentUserId && m.read_at === null,
    )?.id;
  }, [messagesQuery.data, currentUserId]);

  useEffect(() => {
    if (!threadId || !lastIncomingUnread) return;
    markReadMut.mutate();
    // markReadMut est stable (mutation reference) — on n'inclut pas pour éviter
    // de re-déclencher en boucle quand React Query change la mutation interne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, lastIncomingUnread]);

  const [text, setText] = useState("");
  const submit = () => {
    const body = text.trim();
    if (!body || !threadId || !currentUserId || sendMut.isPending) return;
    sendMut.mutate(body, {
      onSuccess: () => setText(""),
    });
  };

  const displayName =
    otherProfile?.display_name || otherProfile?.username || "Conversation";

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <KeyboardDismissBar />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          paddingVertical: 6,
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: hexWithAlpha(themeInk, 0.08),
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={themeInk} />
        </Pressable>
        <Pressable
          onPress={() =>
            otherUserId ? router.push(`/profile/${otherUserId}`) : undefined
          }
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
          className="active:opacity-70"
        >
          <AvatarFrame
            size={HEADER_AVATAR}
            frameId={
              (otherProfile?.appearance as Record<string, unknown> | null | undefined)?.[
                "avatarFrameId"
              ] as string | undefined ?? "none"
            }
          >
            {otherProfile?.avatar_url ? (
              <Image
                source={{ uri: otherProfile.avatar_url }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: hexWithAlpha(themeInk, 0.1),
                }}
              >
                <MaterialIcons
                  name="person"
                  size={18}
                  color={hexWithAlpha(themeInk, 0.6)}
                />
              </View>
            )}
          </AvatarFrame>
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontSize: 16, fontWeight: "600", color: themeInk }}
          >
            {displayName}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {messagesQuery.isLoading && !messagesQuery.data ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={themeInk} />
          </View>
        ) : (
          <FlatList
            data={messagesQuery.data ?? []}
            keyExtractor={(m) => m.id}
            inverted
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isMine={item.sender_id === currentUserId}
              />
            )}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingVertical: 12,
              flexGrow: 1,
            }}
            ListEmptyComponent={<EmptyMessages name={displayName} />}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <Composer
          text={text}
          onChange={setText}
          onSubmit={submit}
          disabled={!currentUserId || !threadId}
          pending={sendMut.isPending}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  isMine,
}: {
  message: Messaging.Message;
  isMine: boolean;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const router = useRouter();

  // Détecte un message portant une référence à une feed entry, format
  // `[grimolia:feed:<id>]`. Si présent, on rend un encart tappable au lieu
  // du body texte. Pas de fetch préalable côté package — on délègue au
  // tap (route `/feed/[entryId]` qui charge l'entry).
  const sharedFeedEntryId = parseFeedShareBody(message.body);

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isMine ? "flex-end" : "flex-start",
        marginBottom: 6,
      }}
    >
      <View style={{ maxWidth: "82%" }}>
        {sharedFeedEntryId ? (
          <FeedSharePreview entryId={sharedFeedEntryId} isMine={isMine} />
        ) : (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 16,
              borderBottomRightRadius: isMine ? 4 : 16,
              borderBottomLeftRadius: isMine ? 16 : 4,
              backgroundColor: isMine
                ? themeAccent
                : hexWithAlpha(themeInk, 0.08),
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: isMine ? "#fff" : themeInk,
                lineHeight: 19,
              }}
            >
              {message.body}
            </Text>
          </View>
        )}
        <Text
          style={{
            fontSize: 10,
            color: hexWithAlpha(themeInk, 0.5),
            marginTop: 3,
            textAlign: isMine ? "right" : "left",
            paddingHorizontal: 4,
          }}
        >
          {timeOf(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

// Mapping verb → libellé court pour l'encart de partage. Ajoute un case
// quand un nouveau verb apparaît côté DB ; default = libellé générique.
function verbLabel(verb: string): string {
  switch (verb) {
    case "shared_sheet":
      return "a partagé une fiche";
    case "posted_review":
      return "a publié un avis";
    case "finished_reading":
      return "a terminé un livre";
    case "won_bingo":
      return "a complété un bingo";
    case "reposted":
      return "a republié une publication";
    default:
      return "a publié quelque chose";
  }
}

// Encart de preview d'une feed entry partagée dans un message. Fetch
// l'entry et rend une mini-card : avatar de l'auteur + nom + verbe court.
// Tap → /feed/[id]. Réutilise les caches RQ de feed et de profile.
function FeedSharePreview({
  entryId,
  isMine,
}: {
  entryId: string;
  isMine: boolean;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const paperWarm = useThemeColors().paperWarm;
  const router = useRouter();

  const entryQuery = useQuery({
    queryKey: ["social", "feed", "entry", entryId],
    queryFn: () => Feed.fetchFeedEntry(entryId),
    enabled: Boolean(entryId),
    staleTime: 1000 * 60,
  });

  const fg = themeInk;
  const subFg = hexWithAlpha(themeInk, 0.6);

  // Card de contenu posée DANS la bulle — fond paper-warm pour rester
  // lisible quels que soient les couleurs de la bulle (utile surtout
  // pour les messages mine, dont le fond est accent-coloré).
  const containerStyle = {
    borderRadius: 16,
    borderBottomRightRadius: isMine ? 4 : 16,
    borderBottomLeftRadius: isMine ? 16 : 4,
    borderWidth: 1,
    borderColor: hexWithAlpha(themeInk, 0.14),
    backgroundColor: paperWarm,
    overflow: "hidden",
    // Largeur "responsive" : remplit la bulle (laquelle est limitée à
    // 82% de la conv via MessageBubble), avec un plancher pour éviter une
    // card trop étroite sur les conv courtes.
    minWidth: 240,
  } as const;

  if (entryQuery.isLoading) {
    return (
      <View style={[containerStyle, { padding: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: hexWithAlpha(fg, 0.12),
            }}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                height: 10,
                width: "60%",
                borderRadius: 4,
                backgroundColor: hexWithAlpha(fg, 0.16),
              }}
            />
            <View
              style={{
                height: 8,
                width: "40%",
                borderRadius: 4,
                backgroundColor: hexWithAlpha(fg, 0.1),
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  const entry = entryQuery.data;
  if (!entry) {
    return (
      <View style={[containerStyle, { padding: 14 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MaterialIcons name="visibility-off" size={20} color={subFg} />
          <Text style={{ fontSize: 13, color: subFg }}>
            Publication indisponible
          </Text>
        </View>
      </View>
    );
  }

  const actor = entry.actor;
  const displayName = actor.display_name || actor.username || "Quelqu'un";
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const body = renderFeedItemBody(entry);

  return (
    <Pressable
      onPress={() => router.push(`/feed/${entryId}`)}
      style={({ pressed }) => ({
        ...containerStyle,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* En-tête : avatar + nom + verbe. Tap géré par le wrapper Pressable
          (les éventuels Pressables internes du body — book cover, sheet
          card — captent leur propre tap en priorité, comme dans le feed). */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 12,
          paddingTop: 12,
          paddingBottom: body ? 6 : 12,
        }}
      >
        <ActorAvatar profile={actor} size={32} fg={fg} initials={initials} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 13, fontWeight: "600", color: fg }}
          >
            {displayName}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 11, color: subFg }}>
            {verbLabel(entry.verb)}
          </Text>
        </View>
        <MaterialIcons name="open-in-new" size={16} color={subFg} />
      </View>
      {body ? (
        <View style={{ paddingBottom: 4 }}>
          {body}
        </View>
      ) : null}
    </Pressable>
  );
}

function ActorAvatar({
  profile,
  size,
  fg,
  initials,
}: {
  profile: SocialProfile;
  size: number;
  fg: string;
  initials: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: hexWithAlpha(fg, 0.15),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {profile.avatar_url ? (
        <Image
          source={{ uri: profile.avatar_url }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      ) : (
        <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

function Composer({
  text,
  onChange,
  onSubmit,
  disabled,
  pending,
}: {
  text: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const themePaper = usePreferences((s) => s.colorBg);

  const sendDisabled = text.trim().length === 0 || disabled || pending;

  return (
    <View
      style={{
        backgroundColor: themePaper,
        borderTopWidth: 1,
        borderTopColor: hexWithAlpha(themeInk, 0.1),
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <TextInput
        value={text}
        onChangeText={onChange}
        placeholder="Écrire un message…"
        placeholderTextColor={hexWithAlpha(themeInk, 0.4)}
        multiline
        editable={!disabled}
        style={{
          flex: 1,
          maxHeight: 120,
          fontSize: 14,
          color: themeInk,
          backgroundColor: hexWithAlpha(themeInk, 0.06),
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      />
      <Pressable
        onPress={onSubmit}
        accessibilityLabel="Envoyer le message"
        disabled={sendDisabled}
        style={({ pressed }) => ({
          width: 38,
          height: 38,
          alignItems: "center",
          justifyContent: "center",
          opacity: sendDisabled ? 0.35 : pressed ? 0.6 : 1,
        })}
      >
        <MaterialIcons name="send" size={22} color={themeAccent} />
      </Pressable>
    </View>
  );
}

function EmptyMessages({ name }: { name: string }) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  return (
    // inverted FlatList → on inverse aussi le contenu vide pour qu'il
    // apparaisse à l'endroit visuellement.
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", transform: [{ scaleY: -1 }], paddingHorizontal: 32 }}
    >
      <MaterialIcons
        name="chat-bubble-outline"
        size={36}
        color={hexWithAlpha(themeInk, 0.45)}
      />
      <Text className="mt-3 text-center font-display text-lg text-ink">
        Démarre la conversation
      </Text>
      <Text className="mt-1 text-center text-sm text-ink-muted">
        Envoie un premier message à {name}.
      </Text>
    </View>
  );
}
