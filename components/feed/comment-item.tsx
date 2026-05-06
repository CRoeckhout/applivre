// Item de commentaire (root ou reply). Affiche avatar+nom (police perso),
// body (ou "[supprimé]" si soft-deleted avec replies), méta (time ago,
// indicateur édité), bouton like (réactions sur target_kind='comment'),
// bouton Répondre (root uniquement), et menu 3-dots pour les commentaires
// de l'user courant (Modifier disabled si !is_editable, Supprimer toujours).

import { hexWithAlpha } from "@/lib/sheet-appearance";
import { getFont } from "@/lib/theme/fonts";
import { usePreferences } from "@/store/preferences";
import { useAuth } from "@/hooks/use-auth";
import { MaterialIcons } from "@expo/vector-icons";
import {
  Comments,
  Reactions,
  type TargetRef,
  type UserId,
} from "@grimolia/social";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

const AVATAR_SIZE_ROOT = 30;
const AVATAR_SIZE_REPLY = 24;

function timeAgo(iso: string): string {
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

function readStr(
  appearance: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!appearance) return undefined;
  const v = appearance[key];
  return typeof v === "string" ? v : undefined;
}

// Toggle like sur un commentaire. Met à jour optimistiquement la liste root
// ET la liste replies pour le commentaire visé. N'utilise PAS la cache des
// Reactions (qui ferait N+1 round-trips à l'init).
function useToggleCommentLike(
  comment: Comments.Comment,
  target: TargetRef,
  currentUserId: UserId | null,
) {
  const qc = useQueryClient();
  const rootKey = ["social", "comments", "root", target.kind, target.id];
  const replyKey = comment.parent_id
    ? ["social", "comments", "replies", comment.parent_id]
    : null;

  return useMutation({
    mutationFn: async () => {
      if (!currentUserId) throw new Error("Not authenticated");
      const next = !comment.my_like;
      if (next) {
        await Reactions.addReaction(
          currentUserId,
          { kind: "comment", id: comment.id },
          "like",
        );
      } else {
        await Reactions.removeReaction(
          currentUserId,
          { kind: "comment", id: comment.id },
          "like",
        );
      }
    },
    onMutate: () => {
      const next = !comment.my_like;
      const update = (list: Comments.Comment[] | undefined) =>
        list?.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                my_like: next,
                like_count: Math.max(0, c.like_count + (next ? 1 : -1)),
              }
            : c,
        );
      qc.setQueryData<Comments.Comment[]>(rootKey, update);
      if (replyKey) qc.setQueryData<Comments.Comment[]>(replyKey, update);
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: rootKey });
      if (replyKey) qc.invalidateQueries({ queryKey: replyKey });
    },
  });
}

export type CommentItemProps = {
  comment: Comments.Comment;
  target: TargetRef;
  // En mode 'preview', "Voir les N réponses" navigue vers /feed/[entryId].
  // En mode 'full', c'est un toggle qui charge inline les replies.
  mode: "preview" | "full";
  entryId: string;
  // Bubble up vers FeedItemFrame qui gère le state replyTo et focus l'input.
  onReply?: (comment: Comments.Comment) => void;
  // Plus petit, indenté (pour les replies sous un root).
  compact?: boolean;
  // True si ce commentaire est actuellement ciblé par l'input de réponse —
  // applique un highlight visuel et déclenche scroll-into-view.
  isActive?: boolean;
  // Drillé depuis FeedItemFrame → CommentsSection. Le parent (écran dédié)
  // mesure le node passé contre sa ScrollView et scroll pour amener le
  // commentaire en vue.
  scrollIntoView?: (node: View) => void;
};

export function CommentItem({
  comment,
  target,
  mode,
  entryId,
  onReply,
  compact,
  isActive,
  scrollIntoView,
}: CommentItemProps) {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const isOwn = currentUserId !== null && currentUserId === comment.user_id;
  const isDeleted = comment.deleted_at !== null;
  const isReply = comment.parent_id !== null;

  const containerRef = useRef<View | null>(null);

  // Quand le commentaire devient actif, on demande au parent de scroller le
  // node en vue. Petit délai pour laisser le layout se stabiliser (highlight
  // ajoute du padding qui change la hauteur ; sur Android, measureLayout sur
  // un node qui vient juste d'être commit peut renvoyer 0).
  useEffect(() => {
    if (!isActive || !scrollIntoView) return;
    const t = setTimeout(() => {
      if (containerRef.current) scrollIntoView(containerRef.current);
    }, 80);
    return () => clearTimeout(t);
  }, [isActive, scrollIntoView]);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);
  const [showReplies, setShowReplies] = useState(false);

  // Quand le commentaire devient la cible de réponse, on déroule ses
  // réponses existantes — l'utilisateur voit le fil dans lequel il s'inscrit.
  // On ne replie pas automatiquement au désactivement : si l'user a vu les
  // réponses, il les voit jusqu'à ce qu'il décide explicitement de les masquer.
  useEffect(() => {
    if (isActive && mode === "full" && !isReply && comment.replies_count > 0) {
      setShowReplies(true);
    }
  }, [isActive, mode, isReply, comment.replies_count]);

  const editMut = Comments.useEditComment(target);
  const delMut = Comments.useDeleteComment(target);
  const likeMut = useToggleCommentLike(comment, target, currentUserId);

  const repliesQuery = Comments.useReplies(comment.id, {
    enabled: showReplies && !isReply,
  });

  const avatarSize = compact ? AVATAR_SIZE_REPLY : AVATAR_SIZE_ROOT;
  const fontSize = compact ? 12 : 13;

  const ownerFontId = readStr(comment.actor.appearance, "fontId");
  const ownerColorSecondary = readStr(
    comment.actor.appearance,
    "colorSecondary",
  );
  const fontFamily = ownerFontId
    ? getFont(ownerFontId as never).variants.display
    : undefined;

  const handle = comment.actor.username
    ? `@${comment.actor.username}`
    : comment.actor.display_name || "Anonyme";

  const likeColor = comment.my_like ? themeAccent : hexWithAlpha(themeInk, 0.7);

  const openMenu = () => {
    const buttons: {
      text: string;
      onPress?: () => void;
      style?: "default" | "cancel" | "destructive";
    }[] = [];
    if (comment.is_editable) {
      buttons.push({
        text: "Modifier",
        onPress: () => {
          setEditText(comment.body);
          setEditing(true);
        },
      });
    }
    buttons.push({
      text: "Supprimer",
      style: "destructive",
      onPress: () => {
        Alert.alert(
          "Supprimer ce commentaire ?",
          "Cette action est irréversible.",
          [
            { text: "Annuler", style: "cancel" },
            {
              text: "Supprimer",
              style: "destructive",
              onPress: () =>
                delMut.mutate({
                  id: comment.id,
                  parentId: comment.parent_id,
                }),
            },
          ],
        );
      },
    });
    buttons.push({ text: "Annuler", style: "cancel" });
    Alert.alert(
      "Commentaire",
      comment.is_editable
        ? undefined
        : "Modification désactivée — ce commentaire a déjà reçu une réponse ou une réaction.",
      buttons,
    );
  };

  const submitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed.length === 0 || trimmed === comment.body) {
      setEditing(false);
      return;
    }
    editMut.mutate(
      { id: comment.id, body: trimmed },
      { onSettled: () => setEditing(false) },
    );
  };

  return (
    <View
      ref={containerRef}
      style={{
        flexDirection: "row",
        gap: 8,
        paddingVertical: 6,
        // Highlight quand ciblé par l'input. Padding/marginNeg compensent
        // pour ne pas faire bouger les voisins quand le bg apparaît.
        paddingHorizontal: isActive ? 8 : 0,
        marginHorizontal: isActive ? -8 : 0,
        backgroundColor: isActive
          ? hexWithAlpha(themeAccent, 0.1)
          : "transparent",
        borderRadius: isActive ? 8 : 0,
      }}
    >
      <Pressable
        onPress={() => router.push(`/profile/${comment.user_id}`)}
        accessibilityLabel={`Profil de ${handle}`}
      >
        <View
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            overflow: "hidden",
            backgroundColor: hexWithAlpha(themeInk, 0.1),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {comment.actor.avatar_url ? (
            <Image
              source={{ uri: comment.actor.avatar_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <MaterialIcons
              name="person"
              size={Math.round(avatarSize * 0.6)}
              color={hexWithAlpha(themeInk, 0.5)}
            />
          )}
        </View>
      </Pressable>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily,
              fontSize,
              fontWeight: "600",
              color: ownerColorSecondary ?? themeInk,
              flexShrink: 1,
            }}
          >
            {handle}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: hexWithAlpha(themeInk, 0.5),
            }}
          >
            · {timeAgo(comment.created_at)}
            {comment.edited_at ? " · modifié" : ""}
          </Text>
          <View style={{ flex: 1 }} />
          {isOwn && !isDeleted ? (
            <Pressable
              onPress={openMenu}
              hitSlop={8}
              accessibilityLabel="Options"
            >
              <MaterialIcons
                name="more-vert"
                size={16}
                color={hexWithAlpha(themeInk, 0.6)}
              />
            </Pressable>
          ) : null}
        </View>

        {editing ? (
          <View style={{ marginTop: 4 }}>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              style={{
                fontSize,
                color: themeInk,
                backgroundColor: hexWithAlpha(themeInk, 0.05),
                borderRadius: 8,
                padding: 8,
                minHeight: 40,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 6,
              }}
            >
              <Pressable
                onPress={() => setEditing(false)}
                style={({ pressed }) => ({
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: hexWithAlpha(themeInk, 0.7),
                  }}
                >
                  Annuler
                </Text>
              </Pressable>
              <Pressable
                onPress={submitEdit}
                disabled={editMut.isPending}
                style={({ pressed }) => ({
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: themeAccent,
                  opacity: editMut.isPending ? 0.6 : pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontSize: 12, color: "#fff", fontWeight: "500" }}>
                  Enregistrer
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text
            style={{
              fontSize,
              color: themeInk,
              fontStyle: isDeleted ? "italic" : "normal",
              opacity: isDeleted ? 0.5 : 1,
              marginTop: 1,
            }}
          >
            {isDeleted ? "[Commentaire supprimé]" : comment.body}
          </Text>
        )}

        {!editing && !isDeleted ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 22,
              marginTop: 6,
            }}
          >
            <Pressable
              onPress={() => {
                if (!currentUserId) return;
                likeMut.mutate();
              }}
              disabled={!currentUserId || likeMut.isPending}
              accessibilityLabel={
                comment.my_like ? "Retirer le j'aime" : "J'aime"
              }
              accessibilityState={{ selected: comment.my_like }}
              hitSlop={8}
              style={({ pressed }) => ({
                paddingVertical: 4,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              {/* Wrapper explicite : la `style` function du Pressable ne
                  applique pas toujours flexDirection:row de manière fiable
                  (le label tombe sous l'icône). */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <MaterialIcons
                  name={comment.my_like ? "thumb-up-alt" : "thumb-up-off-alt"}
                  size={16}
                  color={likeColor}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "500",
                    color: likeColor,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {comment.like_count > 0 ? comment.like_count : "J'aime"}
                </Text>
              </View>
            </Pressable>

            {!isReply && onReply ? (
              <Pressable
                onPress={() => onReply(comment)}
                hitSlop={8}
                style={({ pressed }) => ({
                  paddingVertical: 4,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "500",
                    color: hexWithAlpha(themeInk, 0.7),
                  }}
                >
                  Répondre
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Lien "Voir/Masquer les N réponses" — sur sa propre ligne pour
            laisser de l'air, et parce qu'il est conditionnel (pas de bruit
            quand 0 réponse). marginTop posé sur un wrapper View : avec une
            `style` function sur Pressable, la marge n'est pas toujours
            appliquée fiablement par RN (cf. même bug que flexDirection). */}
        {!isReply && comment.replies_count > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Pressable
              onPress={() => setShowReplies((v) => !v)}
              hitSlop={8}
              style={({ pressed }) => ({
                paddingVertical: 4,
                alignSelf: "flex-start",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "500",
                  color: hexWithAlpha(themeInk, 0.7),
                }}
              >
                {showReplies
                  ? "Masquer les réponses"
                  : `Voir ${comment.replies_count > 1 ? "les" : "la"} ${comment.replies_count} réponse${comment.replies_count > 1 ? "s" : ""}`}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Replies inline (full mode only). */}
        {showReplies && repliesQuery.data && repliesQuery.data.length > 0 ? (
          <View
            style={{
              marginTop: 6,
              paddingLeft: 4,
              borderLeftWidth: 2,
              borderLeftColor: hexWithAlpha(themeInk, 0.1),
            }}
          >
            {repliesQuery.data.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                target={target}
                mode={mode}
                entryId={entryId}
                compact
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
