// Section commentaires d'un item de feed. Deux modes :
//
//   - 'preview' (dans FeedItemFrame du flux) : 2 derniers root comments,
//     "Voir les X commentaires" → push /feed/[entryId] si X > 2.
//
//   - 'full' (dans /feed/[entryId]) : tous les roots, replies inline
//     dépliables par root.
//
// Côté data : root comments via Comments.useRootComments. Les replies sont
// fetch lazily par CommentItem au clic "Voir les N réponses" (full mode
// uniquement).

import { CommentItem } from "@/components/feed/comment-item";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import { Comments, type TargetRef } from "@grimolia/social";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

const PREVIEW_COUNT = 2;

export function CommentsSection({
  target,
  entryId,
  mode,
  onReply,
  activeCommentId,
  scrollIntoView,
}: {
  target: TargetRef;
  entryId: string;
  mode: "preview" | "full";
  onReply?: (comment: Comments.Comment) => void;
  // Id du commentaire racine actuellement ciblé par l'input (mode full
  // uniquement). Highlight visuel + scroll-into-view.
  activeCommentId?: string | null;
  scrollIntoView?: (node: View) => void;
}) {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);

  const query = Comments.useRootComments(target);
  const all = query.data ?? [];

  // Compte affiché : root comments + somme des replies. Cohérent avec ce que
  // l'utilisateur "voit" comme threads (différent du compte de la stat row
  // qui pourrait n'afficher QUE les roots — à harmoniser plus tard).
  const totalThreads = all.reduce((acc, c) => acc + 1 + c.replies_count, 0);

  if (query.isLoading) {
    return (
      <View
        style={{ paddingHorizontal: 14, paddingVertical: 8 }}
      >
        <ActivityIndicator size="small" color={hexWithAlpha(themeInk, 0.4)} />
      </View>
    );
  }

  if (all.length === 0) {
    if (mode === "full") {
      return (
        <View style={{ paddingHorizontal: 14, paddingVertical: 16 }}>
          <Text
            style={{
              fontSize: 12,
              color: hexWithAlpha(themeInk, 0.5),
              textAlign: "center",
            }}
          >
            Sois le premier à commenter.
          </Text>
        </View>
      );
    }
    return null;
  }

  // En preview, on slice les 2 DERNIERS (les plus récents) — l'utilisateur
  // voit en bas le contenu le plus frais.
  const visible =
    mode === "preview" ? all.slice(-PREVIEW_COUNT) : all;
  const hiddenCount = mode === "preview" ? all.length - visible.length : 0;

  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
      {mode === "preview" && (all.length > PREVIEW_COUNT || all.length > 0) ? (
        <Pressable
          onPress={() => router.push(`/feed/${entryId}` as never)}
          hitSlop={4}
          style={({ pressed }) => ({
            marginBottom: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "500",
              color: hexWithAlpha(themeInk, 0.7),
            }}
          >
            {totalThreads > 1
              ? `Voir les ${totalThreads} commentaires`
              : "Voir le commentaire"}
          </Text>
        </Pressable>
      ) : null}

      {visible.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          target={target}
          mode={mode}
          entryId={entryId}
          onReply={onReply}
          isActive={activeCommentId === comment.id}
          scrollIntoView={scrollIntoView}
        />
      ))}

      {/* En preview, si on a tronqué le début (plus que PREVIEW_COUNT), on
          ne montre pas explicitement les "anciens" — le lien plus haut suffit. */}
      {hiddenCount > 0 && mode === "preview" ? null : null}
    </View>
  );
}
