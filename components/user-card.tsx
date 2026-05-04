// Carte utilisateur réutilisable côté social. Deux variantes :
//
// - "compact" (défaut) : avatar + nom inline. Pour les listes, header
//   discret. Avatar simple, fallback initiales.
//
// - "rich" : layout du UserCard du dashboard (admin/src/components/user-card),
//   reproduit à l'identique, MOINS la ligne email. La structure générale
//   (border 1px + padding 14 + radius 12 + header avatar/nom + stats grid +
//   footer Compte/slot) reste stable. Les customizations du user (cadre
//   photo, fond image, police, couleurs, badges) sont posées À L'INTÉRIEUR
//   de cette enveloppe : avatar wrapped dans AvatarFrame, FondLayer en
//   background absolute, police appliquée au nom, badges en row optionnel,
//   bouton Suivre dans le slot footer.
//
// L'email n'apparaît jamais. La version dashboard a accès à
// auth.users.email via SECURITY DEFINER + gate is_admin ; le côté social
// n'a accès qu'aux colonnes publiques (get_public_profiles, cf. 0048).

import { AvatarFrame } from "@/components/avatar-frame";
import { Badge } from "@/components/badges/badge";
import { FondLayer } from "@/components/fond-layer";
import { useAuth } from "@/hooks/use-auth";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { getFont } from "@/lib/theme/fonts";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Follows, useProfile } from "@grimolia/social";
import type { BadgeKey } from "@/types/badge";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Size = "sm" | "md" | "lg";

const COMPACT_AVATAR_DIMENSIONS: Record<Size, number> = {
  sm: 28,
  md: 36,
  lg: 48,
};

const RICH_AVATAR_SIZE = 56;
const RICH_BADGE_COUNT = 5;

export type UserCardStat = { label: string; value: number };

export type UserCardProps = {
  userId: string;
  variant?: "compact" | "rich";
  // Compact uniquement.
  size?: Size;
  showHandle?: boolean;
  showChevron?: boolean;
  // Rich uniquement : grille de stats (slot identique à la dashboard).
  // Default vide — pas de bloc stats rendu.
  stats?: UserCardStat[];
  // Rich uniquement : contenu additionnel dans le footer (à droite du
  // "Compte: <date>"). Si non passé et que isOwner=false, on rend le bouton
  // Suivre par défaut (cf. logique interne).
  footer?: ReactNode;
  // Override la nav par défaut. Sinon push /profile/[userId].
  onPress?: () => void;
  // Classe Tailwind sur le wrapper, pour styles contextuels (margin…).
  className?: string;
};

function initialsOf(name: string): string {
  const parts = name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return parts || "?";
}

// Lit une clé string-valued du blob appearance. Sans typage strict côté
// package — chaque app hôte définit son propre vocabulaire.
function readStr(
  appearance: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!appearance) return undefined;
  const v = appearance[key];
  return typeof v === "string" ? v : undefined;
}

function readNum(
  appearance: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined {
  if (!appearance) return undefined;
  const v = appearance[key];
  return typeof v === "number" ? v : undefined;
}

export function UserCard({
  userId,
  variant = "compact",
  size = "md",
  showHandle = true,
  showChevron,
  stats,
  footer,
  onPress,
  className,
}: UserCardProps) {
  return variant === "rich" ? (
    <UserCardRich
      userId={userId}
      stats={stats}
      footer={footer}
      onPress={onPress}
      className={className}
    />
  ) : (
    <UserCardCompact
      userId={userId}
      size={size}
      showHandle={showHandle}
      showChevron={showChevron}
      onPress={onPress}
      className={className}
    />
  );
}

// ─── Compact ────────────────────────────────────────────────────────────

function UserCardCompact({
  userId,
  size,
  showHandle,
  showChevron,
  onPress,
  className,
}: {
  userId: string;
  size: Size;
  showHandle: boolean;
  showChevron?: boolean;
  onPress?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const profileQuery = useProfile(userId);

  const profile = profileQuery.data;
  const displayName =
    profile?.display_name || profile?.username || "Anonyme";
  const handle = profile?.username ? `@${profile.username}` : null;
  const initials = initialsOf(displayName);

  const dim = COMPACT_AVATAR_DIMENSIONS[size];
  const chevron = showChevron ?? true;

  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/profile/${userId}`))}
      accessibilityLabel={`Profil de ${displayName}`}
      className={`flex-row items-center gap-3 active:opacity-70 ${className ?? ""}`}
    >
      <SimpleAvatar
        dim={dim}
        avatarUrl={profile?.avatar_url ?? null}
        initials={initials}
        themeInk={themeInk}
      />
      <View className="min-w-0 flex-1">
        <Text className="font-sans-med text-ink" numberOfLines={1}>
          {displayName}
        </Text>
        {showHandle && handle ? (
          <Text className="text-xs text-ink-muted" numberOfLines={1}>
            {handle}
          </Text>
        ) : null}
      </View>
      {chevron ? (
        <MaterialIcons name="chevron-right" size={20} color={themeInk} />
      ) : null}
    </Pressable>
  );
}

// ─── Rich ───────────────────────────────────────────────────────────────

function UserCardRich({
  userId,
  stats,
  onPress,
  className,
}: {
  userId: string;
  stats?: UserCardStat[];
  footer?: ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themePaper = usePreferences((s) => s.colorBg);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const isSelf = currentUserId !== null && currentUserId === userId;

  const profileQuery = useProfile(userId);
  const isFollowingQuery = Follows.useIsFollowing(currentUserId, userId);
  const toggleFollow = Follows.useToggleFollow(currentUserId);

  const profile = profileQuery.data;
  // Mirror du dashboard : line 1 = username (favorisé), fallback display_name.
  // Line 2 ex-email = display_name quand distinct du username (purement
  // contextuel — sinon on cache la ligne pour ne pas répéter).
  const primary =
    profile?.username || profile?.display_name || "Anonyme";
  const secondary =
    profile?.username && profile?.display_name &&
    profile.display_name !== profile.username
      ? profile.display_name
      : null;
  const initials = initialsOf(primary);

  const ownerAppearance = profile?.appearance ?? null;
  const ownerFontId = readStr(ownerAppearance, "fontId");
  const ownerColorPrimary = readStr(ownerAppearance, "colorPrimary");
  const ownerColorSecondary = readStr(ownerAppearance, "colorSecondary");
  const ownerColorBg = readStr(ownerAppearance, "colorBg");
  const ownerFondId = readStr(ownerAppearance, "fondId");
  const ownerFondOpacity = readNum(ownerAppearance, "fondOpacity");
  const ownerAvatarFrameId = readStr(ownerAppearance, "avatarFrameId") ?? "none";

  const fontFamily =
    ownerFontId ? getFont(ownerFontId as never).variants.display : undefined;
  const cardBg = ownerColorBg ?? themePaper;
  const fondColorOverrides =
    ownerColorPrimary && ownerColorSecondary && ownerColorBg
      ? {
          colorPrimary: ownerColorPrimary,
          colorSecondary: ownerColorSecondary,
          colorBg: ownerColorBg,
        }
      : undefined;

  const isFollowing = isFollowingQuery.data ?? false;
  const navProfile = onPress ?? (() => router.push(`/profile/${userId}`));

  const badgeKeys = profile?.badge_keys ?? [];
  const visibleBadges = badgeKeys.slice(0, RICH_BADGE_COUNT);

  const followBtn =
    !isSelf && currentUserId ? (
      <Pressable
        onPress={() =>
          toggleFollow.mutate({
            targetUserId: userId,
            next: !isFollowing,
          })
        }
        disabled={toggleFollow.isPending || isFollowingQuery.isLoading}
        accessibilityLabel={isFollowing ? "Ne plus suivre" : "Suivre"}
        accessibilityState={{ selected: isFollowing }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 4,
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
        <MaterialIcons
          name={isFollowing ? "check" : "person-add"}
          size={12}
          color={isFollowing ? themeAccent : "#fff"}
        />
        <Text
          className="font-sans-med text-xs"
          style={{ color: isFollowing ? themeAccent : "#fff" }}
        >
          {isFollowing ? "Suivi" : "Suivre"}
        </Text>
      </Pressable>
    ) : null;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: hexWithAlpha(themeInk, 0.12),
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: cardBg,
      }}
      className={className}
    >
      {/* Fond image du owner posé en absolute fill — visible derrière le
          contenu, ne change pas la silhouette de la card. */}
      {ownerFondId && ownerFondId !== "none" ? (
        <FondLayer
          bgColor={cardBg}
          fondId={ownerFondId}
          colorOverrides={fondColorOverrides}
          opacity={ownerFondOpacity}
        />
      ) : null}

      <View style={{ padding: 14 }}>
        {/* Header row : avatar + colonne droite (username/secondary/badges) +
            bouton Suivre. Pressable sur avatar+colonne ; bouton hors du
            Pressable pour éviter les Pressables imbriqués. */}
        <View
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}
        >
          <Pressable
            onPress={navProfile}
            accessibilityLabel={`Profil de ${primary}`}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 14,
            }}
            className="active:opacity-70"
          >
            <AvatarFrame size={RICH_AVATAR_SIZE} frameId={ownerAvatarFrameId}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <View
                  className="h-full w-full items-center justify-center"
                  style={{ backgroundColor: hexWithAlpha(themeInk, 0.08) }}
                >
                  <Text
                    style={{
                      fontSize: 18,
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
              <Text
                numberOfLines={1}
                style={{
                  fontFamily,
                  fontSize: 15,
                  fontWeight: "600",
                  color: ownerColorSecondary ?? themeInk,
                  marginBottom: 2,
                }}
              >
                {primary}
              </Text>
              {secondary ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    color: hexWithAlpha(themeInk, 0.6),
                    marginBottom: visibleBadges.length > 0 ? 6 : 0,
                  }}
                >
                  {secondary}
                </Text>
              ) : null}
              {visibleBadges.length > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: secondary ? 0 : 4,
                  }}
                >
                  {visibleBadges.map((key) => (
                    <Badge key={key} badgeKey={key as BadgeKey} size={24} />
                  ))}
                </View>
              ) : null}
            </View>
          </Pressable>

          {followBtn}
        </View>

        {stats && stats.length > 0 ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {stats.map((s) => (
              <StatBox
                key={s.label}
                label={s.label}
                value={s.value}
                themeInk={themeInk}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  themeInk,
}: {
  label: string;
  value: number;
  themeInk: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: hexWithAlpha(themeInk, 0.12),
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
      className="items-center"
    >
      <Text className="font-display text-lg text-ink">{value}</Text>
      <Text className="text-[11px] text-ink-muted">{label}</Text>
    </View>
  );
}

function SimpleAvatar({
  dim,
  avatarUrl,
  initials,
  themeInk,
}: {
  dim: number;
  avatarUrl: string | null;
  initials: string;
  themeInk: string;
}) {
  return (
    <View
      style={{
        width: dim,
        height: dim,
        backgroundColor: hexWithAlpha(themeInk, 0.08),
      }}
      className="items-center justify-center overflow-hidden rounded-full"
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      ) : (
        <Text
          style={{
            fontSize: Math.round(dim * 0.4),
            fontWeight: "600",
            color: hexWithAlpha(themeInk, 0.7),
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}
