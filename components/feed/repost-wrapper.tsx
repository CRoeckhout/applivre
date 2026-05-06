// Wrapper de rendu pour une entry verb='reposted'.
//
// Une row repost est un pointeur vers une entry source via target_id. On
// rend UNE SEULE card (celle du FeedItemFrame de la source) en injectant
// dans son slot `topAttachment` :
//   - le FeedItemHeader du REPOSTER (avatar + frame + pseudo + badges +
//     premium + suivre — exactement le même chrome que pour un post normal)
//   - un sous-titre "🔁 a republié"
//   - la note optionnelle du quote-repost
//
// Cette section partage le top-radius de la card et est séparée du header
// source par un divider — visuellement c'est un seul "carton" composé.
//
// L'engagement (likes, commentaires, reposts) reste attaché à la SOURCE
// pour ne pas fragmenter la conversation. C'est natif : FeedItemFrame
// construit son target depuis entry.id, donc passer la source suffit.
//
// Edge case : si la source a été supprimée entre la repost-row et le
// rendu (le trigger cascade côté SQL devrait avoir nettoyé, mais une
// course est possible si le client a un cache RQ stale), on rend un
// placeholder discret.

import type { ReplyTarget } from '@/components/feed/comment-input-row';
import {
  FeedItemFrame,
  FeedItemHeader,
} from '@/components/feed/feed-item-frame';
import { renderFeedItemBody } from '@/components/feed/render-feed-body';
import { useAuth } from '@/hooks/use-auth';
import { hexWithAlpha } from '@/lib/sheet-appearance';
import { usePreferences } from '@/store/preferences';
import { MaterialIcons } from '@expo/vector-icons';
import { Feed } from '@grimolia/social';
import { useQuery } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { Text, TextInput, View } from 'react-native';

type Props = {
  repostEntry: Feed.FeedEntry;
} & (
  | { commentsMode?: 'preview' }
  | {
      commentsMode: 'full';
      replyTo: ReplyTarget | null;
      onReplyToChange: (next: ReplyTarget | null) => void;
      inputRef: RefObject<TextInput | null>;
      scrollIntoView?: (node: View) => void;
    }
);

export function RepostWrapper(props: Props) {
  const { repostEntry } = props;
  const themeInk = usePreferences((s) => s.colorSecondary);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  // Si l'user courant est le reposter, on masque le bouton "Republier" :
  // pas de sens de proposer une action sur sa propre republication.
  const isMyRepost =
    currentUserId !== null && currentUserId === repostEntry.actor_id;

  const sourceId = repostEntry.target_id;

  const sourceQuery = useQuery({
    queryKey: ['social', 'feed', 'entry', sourceId],
    queryFn: () => Feed.fetchFeedEntry(sourceId!),
    enabled: Boolean(sourceId),
    staleTime: 1000 * 60,
  });

  const note =
    typeof repostEntry.meta?.note === 'string'
      ? (repostEntry.meta.note as string)
      : null;

  const muted = hexWithAlpha(themeInk, 0.65);
  const source = sourceQuery.data;

  if (!source) {
    if (sourceQuery.isLoading) return null;
    return (
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 16,
          backgroundColor: hexWithAlpha(themeInk, 0.04),
          borderRadius: 16,
        }}
      >
        <Text style={{ fontSize: 13, color: muted, textAlign: 'center' }}>
          Publication originale supprimée.
        </Text>
      </View>
    );
  }

  // Le topAttachment vit À L'INTÉRIEUR du card-chrome de FeedItemFrame :
  // pas de borderRadius/shadow propre, juste le contenu. Le top-radius est
  // assuré par la card extérieure (overflow: hidden y compris pour
  // l'attachment). L'ordre du contenu :
  //   1. Header standard du reposter (avatar + pseudo + badges + suivre)
  //   2. Petit sous-titre "🔁 a republié" en dessous
  //   3. Note du quote-repost (si présente)
  const topAttachment = (
    <View>
      <FeedItemHeader entry={repostEntry} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingTop: 2,
          paddingBottom: note ? 6 : 12,
        }}
      >
        <MaterialIcons name="repeat" size={14} color={muted} />
        <Text style={{ fontSize: 12, color: muted }} numberOfLines={1}>
          a republié
        </Text>
      </View>

      {note ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <Text style={{ fontSize: 14, color: themeInk, lineHeight: 20 }}>
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (props.commentsMode === 'full') {
    return (
      <FeedItemFrame
        entry={source}
        body={renderFeedItemBody(source)}
        topAttachment={topAttachment}
        hideRepostButton={isMyRepost}
        commentsMode="full"
        replyTo={props.replyTo}
        onReplyToChange={props.onReplyToChange}
        inputRef={props.inputRef}
        scrollIntoView={props.scrollIntoView}
      />
    );
  }

  return (
    <FeedItemFrame
      entry={source}
      body={renderFeedItemBody(source)}
      topAttachment={topAttachment}
      hideRepostButton={isMyRepost}
    />
  );
}
