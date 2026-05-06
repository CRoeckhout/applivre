// Inbox des messages 1:1. Liste des threads triés par dernier message
// décroissant. Tap → /messages/[threadId]. Realtime géré dans Messaging.useThreads
// (subscribe sur social_message_threads + social_messages).

import { AvatarFrame } from "@/components/avatar-frame";
import { parseFeedShareBody } from "@/components/feed/send-to-contact-modal";
import { useAuth } from "@/hooks/use-auth";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Messaging } from "@grimolia/social";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const AVATAR_SIZE = 40;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} j`;
  return `${Math.floor(d / 7)} sem`;
}

export default function MessagesInboxScreen() {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const threadsQuery = Messaging.useThreads(currentUserId);
  const threads = threadsQuery.data ?? [];

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
        <Text className="font-display text-lg text-ink">Messages</Text>
        <View className="h-10 w-10" />
      </View>

      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <ThreadRow
            thread={item}
            currentUserId={currentUserId}
            onPress={() => router.push(`/messages/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          threadsQuery.isLoading ? (
            <View className="mt-12 items-center">
              <ActivityIndicator color={themeInk} />
            </View>
          ) : (
            <EmptyState />
          )
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 32,
        }}
        refreshControl={
          <RefreshControl
            refreshing={threadsQuery.isRefetching}
            onRefresh={() => void threadsQuery.refetch()}
            tintColor={themeInk}
          />
        }
      />
    </SafeAreaView>
  );
}

function ThreadRow({
  thread,
  currentUserId,
  onPress,
}: {
  thread: Messaging.Thread;
  currentUserId: string | null;
  onPress: () => void;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const paperShade = useThemeColors().paperShade;

  const displayName =
    thread.other.display_name || thread.other.username || "Anonyme";
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const lastIsMine =
    thread.last_message?.sender_id === currentUserId && currentUserId !== null;
  const lastBody = thread.last_message?.body ?? "";
  const previewBody = parseFeedShareBody(lastBody)
    ? "📰 Publication partagée"
    : lastBody;
  const preview = thread.last_message
    ? `${lastIsMine ? "Toi : " : ""}${previewBody}`
    : "Conversation démarrée";

  const isUnread = thread.unread_count > 0 && !lastIsMine;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: hexWithAlpha(themeInk, isUnread ? 0.2 : 0.12),
        backgroundColor: paperShade,
      }}
    >
      <AvatarFrame
        size={AVATAR_SIZE}
        frameId={
          ((
            thread.other.appearance as
              | Record<string, unknown>
              | null
              | undefined
          )?.["avatarFrameId"] as string | undefined) ?? "none"
        }
      >
        {thread.other.avatar_url ? (
          <Image
            source={{ uri: thread.other.avatar_url }}
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
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: hexWithAlpha(themeInk, 0.7),
              }}
            >
              {initials}
            </Text>
          </View>
        )}
      </AvatarFrame>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 15,
              fontWeight: isUnread ? "700" : "600",
              color: themeInk,
              flexShrink: 1,
            }}
          >
            {displayName}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: hexWithAlpha(themeInk, 0.5),
              marginLeft: "auto",
            }}
          >
            {timeAgo(thread.last_message_at)}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              color: isUnread ? themeInk : hexWithAlpha(themeInk, 0.6),
              fontWeight: isUnread ? "500" : "400",
              flex: 1,
            }}
          >
            {preview}
          </Text>
          {isUnread ? (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: themeAccent,
              }}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState() {
  const themeInk = usePreferences((s) => s.colorSecondary);
  return (
    <View className="mt-16 items-center px-6">
      <MaterialIcons
        name="chat-bubble-outline"
        size={44}
        color={hexWithAlpha(themeInk, 0.5)}
      />
      <Text className="mt-4 text-center font-display text-xl text-ink">
        Aucune conversation
      </Text>
      <Text className="mt-2 text-center text-base text-ink-muted">
        Tu pourras discuter avec les lecteurs que tu suis et qui te suivent en
        retour.
      </Text>
    </View>
  );
}
