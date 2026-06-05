import { StarRatingDisplay } from '@/components/book-reviews/star-rating';
import { editorialHref, type EditorialPost } from '@/types/editorial';
import { Feed, Reviews } from '@grimolia/social';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

// Template custom de la carte « Avis à la une » : on référence l'avis par
// post.reviewId et on le charge (note + texte + auteur). Affiche la note
// (étoiles) et l'avis tronqué (ellipsis). Le tap ouvre la fiche livre en
// ciblant l'avis (scroll + surbrillance) via editorialHref.
export function FeaturedReviewCard({ post }: { post: EditorialPost }) {
  const router = useRouter();

  // Deux provenances : review_id direct (candidat « avis les plus votés »),
  // ou publication de feed « posted_review » (ref_kind='feed_entry') → on
  // résout l'entrée pour retrouver l'avis.
  const entryId =
    !post.reviewId && post.refKind === 'feed_entry' ? post.refId : null;
  const entryQuery = useQuery({
    queryKey: ['social', 'feed', 'entry', entryId],
    queryFn: () => Feed.fetchFeedEntry(entryId!),
    enabled: Boolean(entryId),
    staleTime: 1000 * 60,
  });
  const reviewId =
    post.reviewId ??
    (entryQuery.data?.target_kind === 'review' ? entryQuery.data.target_id : null);

  const reviewQuery = Reviews.useReview(reviewId);
  const review = reviewQuery.data ?? null;
  const go = () => router.push(editorialHref(post) as Href);

  const author = review?.author;
  const authorName =
    author?.display_name || author?.username || 'Un lecteur';
  // Texte de l'avis : le commentaire complet une fois chargé, sinon l'extrait
  // stocké sur le post (subtitle) — mais seulement pour les refs directes
  // (ref_kind='book') : pour une publication promue, le subtitle est le
  // post_text / nom d'auteur, pas l'avis.
  const comment =
    review?.comment ?? (post.refKind === 'book' ? post.subtitle : null);

  return (
    <Pressable
      onPress={go}
      className="gap-2.5 overflow-hidden rounded-2xl border border-accent/30 bg-paper-warm p-3.5 active:opacity-80"
    >
      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 5, height: 5, borderRadius: 3 }} className="bg-accent" />
        <Text className="font-sans-semi text-[11px] uppercase tracking-wide text-accent">
          Avis à la une
        </Text>
      </View>

      <View className="flex-row gap-3">
        {post.coverUrl ? (
          <Image
            source={{ uri: post.coverUrl }}
            style={{ width: 46, height: 68, borderRadius: 6 }}
            contentFit="cover"
            transition={150}
          />
        ) : null}

        <View className="flex-1 justify-center gap-1.5">
          <Text className="font-display text-base text-ink" numberOfLines={2}>
            {post.title}
          </Text>
          <View className="flex-row items-center gap-2">
            {author?.avatar_url ? (
              <Image
                source={{ uri: author.avatar_url }}
                style={{ width: 18, height: 18, borderRadius: 9 }}
                transition={150}
              />
            ) : null}
            <Text className="flex-shrink text-xs text-ink-muted" numberOfLines={1}>
              {authorName}
            </Text>
            {review ? <StarRatingDisplay value={review.rating} size={13} /> : null}
          </View>
        </View>
      </View>

      {comment ? (
        <Text className="text-sm italic text-ink" numberOfLines={4} style={{ lineHeight: 20 }}>
          «&#8201;{comment}&#8201;»
        </Text>
      ) : null}
    </Pressable>
  );
}
