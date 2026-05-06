// Une ligne utilisateur dans la liste de découverte. Avatar (avec cadre du
// owner), @username avec police perso + chip Premium, stats inline (abonnés
// et fiches publiées), bouton Suivre. Tap sur la zone gauche → /profile/[id].
//
// Différent de UserCard compact (qui n'expose ni cadre ni stats) — c'est un
// composant plus riche dédié à la découverte. UserCard rich serait trop
// gros pour une liste verticale.

import { AvatarFrame } from "@/components/avatar-frame";
import { PremiumChip } from "@/components/premium-chip";
import { useAuth } from "@/hooks/use-auth";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { getFont } from "@/lib/theme/fonts";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Discover, Follows } from "@grimolia/social";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

const AVATAR_SIZE = 48;

function readStr(
  appearance: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!appearance) return undefined;
  const v = appearance[key];
  return typeof v === "string" ? v : undefined;
}

export function DiscoverUserRow({ user }: { user: Discover.DiscoveredUser }) {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);

  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const isFollowingQuery = Follows.useIsFollowing(currentUserId, user.id);
  const toggleFollow = Follows.useToggleFollow(currentUserId);
  const isFollowing = isFollowingQuery.data ?? false;

  const handle = user.username
    ? `@${user.username}`
    : user.display_name || "Anonyme";

  const ownerFontId = readStr(user.appearance, "fontId");
  const ownerColorSecondary = readStr(user.appearance, "colorSecondary");
  const ownerAvatarFrameId =
    readStr(user.appearance, "avatarFrameId") ?? "none";
  const fontFamily = ownerFontId
    ? getFont(ownerFontId as never).variants.display
    : undefined;
  const isPremium = user.is_premium === true;

  const followers = user.follower_count;
  const sheets = user.public_sheets_count;

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
        onPress={() => router.push(`/profile/${user.id}`)}
        accessibilityLabel={`Profil de ${handle}`}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
        className="active:opacity-70"
      >
        <AvatarFrame size={AVATAR_SIZE} frameId={ownerAvatarFrameId}>
          {user.avatar_url ? (
            <Image
              source={{ uri: user.avatar_url }}
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
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

          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontSize: 12,
              color: hexWithAlpha(themeInk, 0.6),
              fontVariant: ["tabular-nums"],
            }}
          >
            {followers} abonné{followers > 1 ? "s" : ""} · {sheets} fiche
            {sheets > 1 ? "s" : ""}
          </Text>
        </View>
      </Pressable>

      {currentUserId ? (
        <Pressable
          onPress={() =>
            toggleFollow.mutate({
              targetUserId: user.id,
              next: !isFollowing,
            })
          }
          disabled={toggleFollow.isPending || isFollowingQuery.isLoading}
          accessibilityLabel={isFollowing ? "Ne plus suivre" : "Suivre"}
          accessibilityState={{ selected: isFollowing }}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: themeAccent,
            backgroundColor: isFollowing ? "transparent" : themeAccent,
            opacity:
              toggleFollow.isPending || isFollowingQuery.isLoading
                ? 0.6
                : pressed
                  ? 0.85
                  : 1,
          })}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <MaterialIcons
              name={isFollowing ? "check" : "person-add"}
              size={16}
              color={isFollowing ? themeAccent : "#fff"}
            />
            <Text
              className="font-sans-med"
              style={{
                fontSize: 14,
                color: isFollowing ? themeAccent : "#fff",
              }}
            >
              {isFollowing ? "Suivi" : "Suivre"}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
