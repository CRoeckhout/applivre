// Coquille visuelle d'un item de feed. Layout commun à tous les verbes :
//
//   ┌─────────────────────────────────────┐
//   │ HEADER : actor (avatar+frame, nom,  │
//   │   badges + premium max 6) + Suivre  │
//   ├─────────────────────────────────────┤
//   │           BODY (slot, par verb)     │
//   ├─────────────────────────────────────┤
//   │ STATS : 👍 N  💬 N  🔁 N             │
//   ├─────────────────────────────────────┤
//   │ ACTIONS : Like | Comment | Share |  │
//   │           Contact                   │
//   ├─────────────────────────────────────┤
//   │ COMMENTS (preview ou full)          │
//   ├─────────────────────────────────────┤
//   │ COMMENT INPUT (avatar + input + ➤)  │
//   └─────────────────────────────────────┘
//
// commentsMode :
//   - 'preview' (défaut, dans le flux) : 2 derniers + lien "Voir les X"
//   - 'full'    (dans /feed/[entryId]) : tous les roots + replies inline
//
// Le frame possède le state `replyTo` (commentaire ciblé par l'input). Les
// boutons "Commenter" (action bar) et "Répondre" (comment item) le mutent
// pour basculer l'input en mode réponse, avec chip annulable.

import { AvatarFrame } from "@/components/avatar-frame";
import { Badge } from "@/components/badges/badge";
import type { ReplyTarget } from "@/components/feed/comment-input-row";
import { CommentsSection } from "@/components/feed/comments-section";
import { RepostModal } from "@/components/feed/repost-modal";
import { SendToContactModal } from "@/components/feed/send-to-contact-modal";
import { PremiumChip } from "@/components/premium-chip";
import { useAuth } from "@/hooks/use-auth";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { getFont } from "@/lib/theme/fonts";
import { usePreferences } from "@/store/preferences";
import type { BadgeKey } from "@/types/badge";
import { MaterialIcons } from "@expo/vector-icons";
import {
  Comments,
  Feed,
  Follows,
  Reactions,
  type TargetRef,
  useProfile,
} from "@grimolia/social";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { ReactNode, RefObject } from "react";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const HEADER_AVATAR_SIZE = 44;
// Ensemble (badges + chip premium). La chip premium prend un slot, donc on
// affiche jusqu'à 5 badges si premium, 6 sinon.
const HEADER_DECORATION_MAX = 6;

function readStr(
  appearance: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!appearance) return undefined;
  const v = appearance[key];
  return typeof v === "string" ? v : undefined;
}

function authorHandle(entry: Feed.FeedEntry): string {
  if (entry.actor.username) return `@${entry.actor.username}`;
  return entry.actor.display_name || "Quelqu'un";
}

// Mode preview : pas d'input, navigation vers l'écran dédié au tap des
// boutons d'écriture. Mode full : l'input est rendu PAR L'ÉCRAN (footer
// sticky dans un KeyboardAvoidingView, sinon le clavier le couvre) ; le
// frame reçoit replyTo + onReplyToChange + inputRef pour piloter le focus
// au clic Commenter / Répondre.
type FeedItemFrameProps = {
  entry: Feed.FeedEntry;
  body: ReactNode;
  // Slot optionnel rendu AU-DESSUS du header, à l'intérieur de la même
  // card-chrome (mêmes radius, shadow, border). Utilisé par RepostWrapper
  // pour coller la section "@userB a republié + note" en haut, partageant
  // le top-radius de la card et un divider avec le header de la source.
  topAttachment?: ReactNode;
  // Masque le bouton "Republier" dans la barre d'actions. Utilisé par
  // RepostWrapper quand l'user courant EST le reposter (pas de sens de
  // proposer "Republier" sur sa propre republication — toggle redondant
  // avec l'edge case "supprimer mon repost" géré ailleurs).
  hideRepostButton?: boolean;
} & (
  | { commentsMode?: "preview" }
  | {
      commentsMode: "full";
      replyTo: ReplyTarget | null;
      onReplyToChange: (next: ReplyTarget | null) => void;
      inputRef: RefObject<TextInput | null>;
      scrollIntoView?: (node: View) => void;
    }
);

export function FeedItemFrame(props: FeedItemFrameProps) {
  const { entry, body } = props;
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themePaper = useThemeColors().paperWarm;
  const divider = hexWithAlpha(themeInk, 0.1);

  const target = useMemo<TargetRef>(
    () => ({ kind: "feed_entry", id: entry.id }),
    [entry.id],
  );

  const isFull = props.commentsMode === "full";
  const replyTo = isFull ? props.replyTo : null;
  const scrollIntoView = isFull ? props.scrollIntoView : undefined;

  const focusInput = () => {
    if (!isFull) return;
    // Léger délai : sur Android, focus() avant la fin du re-render peut
    // être ignoré.
    setTimeout(() => props.inputRef.current?.focus(), 0);
  };

  // Preview → navigation vers l'écran dédié.
  // Full    → focus l'input local et set le replyTo correspondant.
  const onCommentBtn = () => {
    if (!isFull) {
      // focus=1 indique à l'écran cible d'auto-focus l'input + ouvrir le
      // clavier dès l'arrivée.
      router.push({
        pathname: "/feed/[entryId]",
        params: { entryId: entry.id, focus: "1" },
      });
      return;
    }
    props.onReplyToChange(null);
    focusInput();
  };

  const onReplyToComment = (c: Comments.Comment) => {
    if (!isFull) {
      router.push({
        pathname: "/feed/[entryId]",
        params: { entryId: entry.id, replyTo: c.id },
      });
      return;
    }
    props.onReplyToChange({
      commentId: c.id,
      username: c.actor.username || c.actor.display_name || "anonyme",
    });
    focusInput();
  };

  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: themePaper,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
        elevation: 4,
      }}
    >
      <View
        style={{
          backgroundColor: themePaper,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: hexWithAlpha(themeInk, 0.12),
          overflow: "hidden",
        }}
      >
        {props.topAttachment ? (
          <>
            {props.topAttachment}
            <View style={{ height: 1, backgroundColor: divider }} />
          </>
        ) : null}
        <FeedItemHeader entry={entry} />
        <View style={{ height: 1, backgroundColor: divider }} />
        {/* Le slot body n'a pas de padding intrinsèque : chaque verb décide
          (texte court → padding 14 ; SheetCard plein → 0, sa propre frame
          assure le confort visuel). */}
        <View>{body}</View>
        <View style={{ height: 1, backgroundColor: divider }} />
        <EngagementStatsRow entry={entry} target={target} />
        <View style={{ height: 1, backgroundColor: divider }} />
        <ActionsBar
          entry={entry}
          onCommentPress={onCommentBtn}
          authorHandle={authorHandle(entry)}
          hideRepostButton={props.hideRepostButton}
          isFullMode={isFull}
        />
        <View style={{ height: 1, backgroundColor: divider }} />
        <CommentsSection
          target={target}
          entryId={entry.id}
          mode={isFull ? "full" : "preview"}
          onReply={onReplyToComment}
          activeCommentId={replyTo?.commentId ?? null}
          scrollIntoView={scrollIntoView}
        />
      </View>
    </View>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────

export function FeedItemHeader({ entry }: { entry: Feed.FeedEntry }) {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const isSelf = currentUserId !== null && currentUserId === entry.actor_id;

  const profileQuery = useProfile(entry.actor_id);
  const profile = profileQuery.data ?? entry.actor;

  const isFollowingQuery = Follows.useIsFollowing(
    currentUserId,
    entry.actor_id,
  );
  const toggleFollow = Follows.useToggleFollow(currentUserId);
  const isFollowing = isFollowingQuery.data ?? false;

  const label = profile.username
    ? `@${profile.username}`
    : profile.display_name || "Anonyme";

  const ownerFontId = readStr(profile.appearance, "fontId");
  const ownerColorSecondary = readStr(profile.appearance, "colorSecondary");
  const ownerAvatarFrameId =
    readStr(profile.appearance, "avatarFrameId") ?? "none";
  const fontFamily = ownerFontId
    ? getFont(ownerFontId as never).variants.display
    : undefined;

  const isPremium = profile.is_premium === true;
  const badgeKeys = profile.badge_keys ?? [];
  const visibleBadges = badgeKeys.slice(
    0,
    Math.max(0, HEADER_DECORATION_MAX - (isPremium ? 1 : 0)),
  );

  const showFollowBtn = !isSelf && Boolean(currentUserId) && !isFollowing;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        padding: 14,
      }}
    >
      <Pressable
        onPress={() => router.push(`/profile/${entry.actor_id}`)}
        accessibilityLabel={`Profil de ${label}`}
        style={{ flex: 1, flexDirection: "row", gap: 12 }}
        className="active:opacity-70"
      >
        <AvatarFrame size={HEADER_AVATAR_SIZE} frameId={ownerAvatarFrameId}>
          {profile.avatar_url ? (
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
                size={Math.round(HEADER_AVATAR_SIZE * 0.6)}
                color={hexWithAlpha(themeInk, 0.6)}
              />
            </View>
          )}
        </AvatarFrame>

        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Ligne 1 : @username (police perso) + chip Premium à droite. */}
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
                fontFamily,
                fontSize: 15,
                fontWeight: "600",
                color: ownerColorSecondary ?? themeInk,
                flexShrink: 1,
              }}
            >
              {label}
            </Text>
            {isPremium ? <PremiumChip /> : null}
          </View>

          {visibleBadges.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
              }}
            >
              {visibleBadges.map((key) => (
                <Badge key={key} badgeKey={key as BadgeKey} size={22} />
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>

      {showFollowBtn ? (
        <Pressable
          onPress={() =>
            toggleFollow.mutate({
              targetUserId: entry.actor_id,
              next: true,
            })
          }
          disabled={toggleFollow.isPending || isFollowingQuery.isLoading}
          accessibilityLabel="Suivre"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: themeAccent,
            opacity:
              toggleFollow.isPending || isFollowingQuery.isLoading
                ? 0.6
                : pressed
                  ? 0.85
                  : 1,
          })}
        >
          <MaterialIcons name="person-add" size={14} color="#fff" />
          <Text className="font-sans-med text-xs" style={{ color: "#fff" }}>
            Suivre
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Engagement stats ───────────────────────────────────────────────────

function EngagementStatsRow({
  entry,
  target,
}: {
  entry: Feed.FeedEntry;
  target: TargetRef;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const muted = hexWithAlpha(themeInk, 0.65);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const summary = Reactions.useReactionSummary(target, currentUserId);
  const likes = summary.data?.counts.like ?? 0;

  // Total commentaires (root + replies) — partage la cache de CommentsSection.
  const commentsQuery = Comments.useRootComments(target);
  const commentsCount = (commentsQuery.data ?? []).reduce(
    (acc, c) => acc + 1 + c.replies_count,
    0,
  );

  const repostSummary = Feed.useRepostSummary(entry.id);
  const repostsCount = repostSummary.data?.count ?? 0;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 18,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <StatChip icon="thumb-up-alt" label={String(likes)} color={muted} />
      <StatChip
        icon="chat-bubble-outline"
        label={String(commentsCount)}
        color={muted}
      />
      <StatChip icon="repeat" label={String(repostsCount)} color={muted} />
    </View>
  );
}

function StatChip({
  icon,
  label,
  color,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  color: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <MaterialIcons name={icon} size={14} color={color} />
      <Text
        style={{
          fontSize: 12,
          color,
          fontVariant: ["tabular-nums"],
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Actions bar ────────────────────────────────────────────────────────

function ActionsBar({
  entry,
  onCommentPress,
  authorHandle,
  hideRepostButton,
  isFullMode,
}: {
  entry: Feed.FeedEntry;
  onCommentPress: () => void;
  authorHandle: string;
  hideRepostButton?: boolean;
  isFullMode?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-evenly",
        // paddingHorizontal s'ajoute aux slots de space-evenly : les bords
        // visibles font donc paddingHorizontal + slot, les gaps inter-items
        // font slot — un padding plus large que le défaut crée l'asymétrie
        // voulue (bords > gaps).
        paddingHorizontal: 0,
        paddingVertical: 6,
      }}
    >
      <LikeButton entry={entry} />
      <ActionButton
        icon="chat-bubble-outline"
        label="Commenter"
        onPress={onCommentPress}
      />
      {hideRepostButton ? null : (
        <RepostButton
          entry={entry}
          authorHandle={authorHandle}
          isFullMode={isFullMode}
        />
      )}
      <SendButton entry={entry} />
    </View>
  );
}

// Bouton "Envoyer" : permet de partager la publication vers un contact
// (mutual). Au tap, ouvre une modale qui liste les mutuals de l'user
// courant. La sélection envoie un message qui embarque une référence
// vers la feed entry — le chat la déballe en preview tappable.
function SendButton({ entry }: { entry: Feed.FeedEntry }) {
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton
        icon="send"
        label="Envoyer"
        onPress={() => setOpen(true)}
        disabled={!currentUserId}
      />
      <SendToContactModal
        open={open}
        entryId={entry.id}
        currentUserId={currentUserId}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// Toggle repost. Tap :
//   - si déjà reposté → unrepost direct (toggle off)
//   - sinon            → ouvre la RepostModal (avec quote optionnel)
//
// Auto-repost désactivé : si l'entry est mienne, le bouton est masqué
// (cf. spec : on ne peut pas reposter ses propres entries).
function RepostButton({
  entry,
  authorHandle,
  isFullMode,
}: {
  entry: Feed.FeedEntry;
  authorHandle: string;
  isFullMode?: boolean;
}) {
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const summary = Feed.useRepostSummary(entry.id);

  const [modalOpen, setModalOpen] = useState(false);

  const isSelf = currentUserId !== null && currentUserId === entry.actor_id;
  const isReposted = Boolean(summary.data?.myRepostId);

  if (isSelf) return null;

  // Une fois reposté, le bouton bascule en état "Republié ✓" non-toggle.
  // En mode preview (feed list) : tap → ouvre l'écran feed-item de MA
  // republication (target = myRepostId, pas l'entry source visible) —
  // l'écran dédié rend le RepostWrapper avec ma section "@moi a republié"
  // au-dessus de la source. En mode full : no-op pour éviter la
  // profondeur infinie. L'unrepost reste accessible ailleurs (édition /
  // suppression depuis le profil), mais plus depuis cette barre.
  if (isReposted) {
    const myRepostId = summary.data?.myRepostId ?? null;
    return (
      <ActionButton
        icon="check-circle"
        label="Republié"
        onPress={() => {
          if (isFullMode || !myRepostId) return;
          router.push({
            pathname: "/feed/[entryId]",
            params: { entryId: myRepostId },
          });
        }}
        color={themeAccent}
        accessibilityLabel={
          isFullMode ? "Republiée" : "Voir ma republication"
        }
        selected
      />
    );
  }

  return (
    <>
      <ActionButton
        icon="repeat"
        label="Republier"
        onPress={() => {
          if (!currentUserId) return;
          setModalOpen(true);
        }}
        disabled={!currentUserId}
        accessibilityLabel="Republier"
      />
      <RepostModal
        open={modalOpen}
        entryId={entry.id}
        authorHandle={authorHandle}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

function LikeButton({ entry }: { entry: Feed.FeedEntry }) {
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const target = useMemo<TargetRef>(
    () => ({ kind: "feed_entry", id: entry.id }),
    [entry.id],
  );
  const summary = Reactions.useReactionSummary(target, currentUserId);
  const toggle = Reactions.useToggleReaction(target, currentUserId);
  const isLiked = summary.data?.myReactions.like ?? false;

  return (
    <ActionButton
      icon={isLiked ? "thumb-up-alt" : "thumb-up-off-alt"}
      label="J'aime"
      onPress={() => {
        if (!currentUserId) return;
        toggle.mutate({ type: "like", next: !isLiked });
      }}
      color={isLiked ? themeAccent : undefined}
      disabled={!currentUserId || toggle.isPending}
      accessibilityLabel={isLiked ? "Retirer le j'aime" : "J'aime"}
      selected={isLiked}
    />
  );
}

// Bouton d'action générique de l'ActionsBar : icône + label, optionnellement
// coloré (active state pour Like / Republier highlightés). `color` override
// la couleur muted par défaut. `accessibilityState.selected` propage l'état
// actif aux lecteurs d'écran.
function ActionButton({
  icon,
  label,
  onPress,
  color,
  disabled,
  accessibilityLabel,
  selected,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  selected?: boolean;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const resolvedColor = color ?? hexWithAlpha(themeInk, 0.8);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={
        selected !== undefined ? { selected, disabled } : { disabled }
      }
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 4,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <MaterialIcons
        name={icon}
        size={16}
        color={resolvedColor}
        style={{ textAlign: "center" }}
      />
      <Text
        style={{
          fontSize: 12,
          fontWeight: "500",
          textAlign: "center",
          color: resolvedColor,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
