// Liste des abonnés / abonnements d'un profil. Deux onglets :
//
// - "followers" (Abonnés) : les users qui suivent le profil consulté.
// - "following" (Abonnements) : les users que le profil consulté suit.
//
// Pour chaque ligne, on indique la relation vis-à-vis du visiteur courant :
// un chip "Vous suit" quand cette personne m'a en abonnement, et un bouton
// Suivre / Suivi pour (dé)suivre. Le statut est dérivé de deux sets chargés
// une seule fois (mes abonnements + mes abonnés), pas d'un appel par ligne.

import { usePaperScreenClass } from "@/components/app-fond-background";
import { AvatarFrame } from "@/components/avatar-frame";
import { PremiumChip } from "@/components/premium-chip";
import { useAuth } from "@/hooks/use-auth";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { getFont } from "@/lib/theme/fonts";
import { readableTextColor } from "@/lib/theme/colors";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Follows, Messaging, useProfile, useProfiles } from "@grimolia/social";
import type { SocialProfile } from "@grimolia/social";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const AVATAR_SIZE = 48;

type Tab = "followers" | "following";

function readStr(
  appearance: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!appearance) return undefined;
  const v = appearance[key];
  return typeof v === "string" ? v : undefined;
}

export default function ConnectionsScreen() {
  const paperScreen = usePaperScreenClass();
  const { userId, tab } = useLocalSearchParams<{
    userId: string;
    tab?: string;
  }>();
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const paper = useThemeColors().paper;
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const isSelf = !!userId && currentUserId === userId;

  const activeTab: Tab = tab === "following" ? "following" : "followers";

  const ownerProfile = useProfile(userId);
  const ownerName =
    ownerProfile.data?.username || ownerProfile.data?.display_name || null;

  // IDs de la liste affichée selon l'onglet.
  const followersQuery = Follows.useFollowers(userId);
  const followingQuery = Follows.useFollowing(userId);
  const listQuery = activeTab === "followers" ? followersQuery : followingQuery;
  const ids = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  // Profils en batch (évite le N+1).
  const profilesQuery = useProfiles(ids);

  // Relation vis-à-vis du visiteur : 2 requêtes, dérivées par ligne.
  const myFollowingQuery = Follows.useFollowing(currentUserId);
  const myFollowersQuery = Follows.useFollowers(currentUserId);
  const myFollowing = useMemo(
    () => new Set(myFollowingQuery.data ?? []),
    [myFollowingQuery.data],
  );
  const myFollowers = useMemo(
    () => new Set(myFollowersQuery.data ?? []),
    [myFollowersQuery.data],
  );

  const profileMap = profilesQuery.data ?? {};
  const loading = listQuery.isLoading || profilesQuery.isLoading;

  const title = isSelf
    ? activeTab === "followers"
      ? "Mes abonnés"
      : "Mes abonnements"
    : activeTab === "followers"
      ? "Abonnés"
      : "Abonnements";

  return (
    <SafeAreaView className={`flex-1 ${paperScreen}`} edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={themeInk} />
        </Pressable>
        <View className="flex-1 items-center px-2">
          <Text numberOfLines={1} className="font-display text-lg text-ink">
            {title}
          </Text>
          {!isSelf && ownerName ? (
            <Text numberOfLines={1} className="text-xs text-ink-muted">
              @{ownerName}
            </Text>
          ) : null}
        </View>
        <View className="h-10 w-10" />
      </View>

      {/* Segmented control natif Abonnés / Abonnements */}
      <View className="px-4 pb-3 pt-1">
        <SegmentedControl
          segments={[
            { key: "followers", label: "Abonnés" },
            { key: "following", label: "Abonnements" },
          ]}
          active={activeTab}
          onChange={(key) => router.setParams({ tab: key })}
          themeInk={themeInk}
          paper={paper}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={themeInk} />
        </View>
      ) : (
        <FlatList
          data={ids}
          keyExtractor={(id) => id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 32,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={listQuery.isRefetching}
              onRefresh={() => listQuery.refetch()}
              tintColor={themeInk}
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8 pt-24">
              <MaterialIcons
                name="people-outline"
                size={36}
                color={hexWithAlpha(themeInk, 0.4)}
              />
              <Text className="mt-3 text-center text-sm text-ink-muted">
                {activeTab === "followers"
                  ? isSelf
                    ? "Personne ne te suit pour l'instant."
                    : "Aucun abonné pour l'instant."
                  : isSelf
                    ? "Tu ne suis personne pour l'instant."
                    : "Aucun abonnement pour l'instant."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ConnectionRow
              userId={item}
              profile={profileMap[item] ?? null}
              isCurrentUser={item === currentUserId}
              currentUserId={currentUserId}
              iFollow={myFollowing.has(item)}
              followsMe={myFollowers.has(item)}
              // "Vous suit" est tautologique dans mes propres abonnés (ils me
              // suivent tous par définition) — on masque juste le chip, sans
              // toucher à `followsMe` (sinon le bouton Message, qui dépend de
              // la mutualité, disparaîtrait du tab Abonnés).
              showFollowsMeChip={!(isSelf && activeTab === "followers")}
              themeInk={themeInk}
              themeAccent={themeAccent}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

// Segmented control façon iOS : un conteneur teinté, le segment actif
// surélevé avec un fond "paper" + ombre légère.
function SegmentedControl<K extends string>({
  segments,
  active,
  onChange,
  themeInk,
  paper,
}: {
  segments: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  themeInk: string;
  paper: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: hexWithAlpha(themeInk, 0.07),
        borderRadius: 11,
        padding: 3,
      }}
    >
      {segments.map((seg) => {
        const isActive = seg.key === active;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: isActive ? paper : "transparent",
              ...(isActive
                ? {
                    shadowColor: "#000",
                    shadowOpacity: 0.12,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                  }
                : null),
            }}
          >
            <Text
              className="font-sans-med"
              style={{
                fontSize: 13,
                color: isActive
                  ? themeInk
                  : hexWithAlpha(themeInk, 0.55),
              }}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ConnectionRow({
  userId,
  profile,
  isCurrentUser,
  currentUserId,
  iFollow,
  followsMe,
  showFollowsMeChip,
  themeInk,
  themeAccent,
}: {
  userId: string;
  profile: SocialProfile | null;
  isCurrentUser: boolean;
  currentUserId: string | null;
  iFollow: boolean;
  followsMe: boolean;
  showFollowsMeChip: boolean;
  themeInk: string;
  themeAccent: string;
}) {
  const router = useRouter();
  const toggleFollow = Follows.useToggleFollow(currentUserId);
  const ensureThread = Messaging.useEnsureThread();
  // Texte/icône lisible sur le fond accent du bouton plein « Suivre ».
  const onAccent = readableTextColor(themeAccent);

  // Conversation possible uniquement si relation mutuelle (je le suis ET il
  // me suit) — même règle que le bouton Message du UserCard.
  const isMutual = iFollow && followsMe;

  const openConversation = async () => {
    if (!currentUserId || ensureThread.isPending) return;
    try {
      const threadId = await ensureThread.mutateAsync(userId);
      // `other` en param pour rendre l'écran utilisable avant que le thread
      // n'apparaisse dans list_my_threads (filtre les threads vides).
      router.push({
        pathname: "/messages/[threadId]",
        params: { threadId, other: userId },
      });
    } catch {
      // Échec silencieux : policy modifiée entre le calcul UI et l'appel SQL.
    }
  };

  const handle = profile?.username
    ? `@${profile.username}`
    : profile?.display_name || "Anonyme";

  const ownerFontId = readStr(profile?.appearance, "fontId");
  const ownerColorSecondary = readStr(profile?.appearance, "colorSecondary");
  const ownerAvatarFrameId =
    readStr(profile?.appearance, "avatarFrameId") ?? "none";
  const fontFamily = ownerFontId
    ? getFont(ownerFontId as never).variants.display
    : undefined;
  const isPremium = profile?.is_premium === true;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
      }}
    >
      <Pressable
        onPress={() => router.push(`/profile/${userId}`)}
        accessibilityLabel={`Profil de ${handle}`}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
        className="active:opacity-70"
      >
        <AvatarFrame size={AVATAR_SIZE} frameId={ownerAvatarFrameId}>
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: hexWithAlpha(themeInk, 0.08),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons
                name="person"
                size={Math.round(AVATAR_SIZE * 0.6)}
                color={hexWithAlpha(themeInk, 0.6)}
              />
            </View>
          )}
        </AvatarFrame>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily,
                fontSize: 15,
                fontWeight: "600",
                color: ownerColorSecondary ?? themeInk,
                flexShrink: 1,
              }}
            >
              {handle}
            </Text>
            {isPremium ? <PremiumChip /> : null}
          </View>

          {/* "Vous suit" = cette personne a le visiteur en abonnement. */}
          {!isCurrentUser && followsMe && showFollowsMeChip ? (
            <View
              style={{
                marginTop: 3,
                alignSelf: "flex-start",
                paddingHorizontal: 7,
                paddingVertical: 1,
                borderRadius: 999,
                backgroundColor: hexWithAlpha(themeInk, 0.08),
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: hexWithAlpha(themeInk, 0.65),
                }}
              >
                Vous suit
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      {/* Actions — masquées sur soi-même. Bouton Message (icône) quand la
          relation est mutuelle, à gauche de la pill Suivre / Suivi. */}
      {!isCurrentUser && currentUserId ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {isMutual ? (
            <Pressable
              onPress={openConversation}
              disabled={ensureThread.isPending}
              accessibilityLabel="Envoyer un message"
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: themeAccent,
                alignItems: "center",
                justifyContent: "center",
                opacity: ensureThread.isPending ? 0.6 : pressed ? 0.85 : 1,
              })}
            >
              <MaterialIcons
                name="chat-bubble-outline"
                size={17}
                color={themeAccent}
              />
            </Pressable>
          ) : null}

          <Pressable
            onPress={() =>
              toggleFollow.mutate({ targetUserId: userId, next: !iFollow })
            }
            disabled={toggleFollow.isPending}
            accessibilityLabel={iFollow ? "Ne plus suivre" : "Suivre"}
            accessibilityState={{ selected: iFollow }}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: themeAccent,
              backgroundColor: iFollow ? "transparent" : themeAccent,
              opacity: toggleFollow.isPending ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <MaterialIcons
                name={iFollow ? "check" : "person-add"}
                size={16}
                color={iFollow ? themeAccent : onAccent}
              />
              <Text
                className="font-sans-med"
                style={{
                  fontSize: 14,
                  color: iFollow ? themeAccent : onAccent,
                }}
              >
                {iFollow ? "Suivi" : "Suivre"}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
