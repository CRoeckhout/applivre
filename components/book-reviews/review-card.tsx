// Carte d'un avis dans la liste : auteur (avatar + pseudo), note, comment,
// date relative, votes up/down. Style aligné sur les cartes paper-warm
// utilisées ailleurs.

import type { Reviews } from '@grimolia/social';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ReviewVoteButtons } from './review-vote-buttons';
import { StarRatingDisplay } from './star-rating';

type Props = {
  review: Reviews.BookReview;
  bookIsbn: string;
};

function relativeDate(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffSec = Math.max(0, (now - date.getTime()) / 1000);
  if (diffSec < 60) return "à l'instant";
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `il y a ${days} j`;
  return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ReviewCard({ review, bookIsbn }: Props) {
  const router = useRouter();
  const author = review.author;
  const displayName =
    author.display_name || author.username || 'Lecteur anonyme';

  return (
    <View className="rounded-3xl bg-paper-warm p-4">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => router.push(`/profile/${author.id}`)}
          hitSlop={4}
          className="h-10 w-10 overflow-hidden rounded-full bg-paper"
        >
          {author.avatar_url ? (
            <Image
              source={{ uri: author.avatar_url }}
              style={{ width: '100%', height: '100%' }}
              transition={150}
            />
          ) : null}
        </Pressable>
        <View className="flex-1">
          <Text className="font-sans-med text-sm text-ink" numberOfLines={1}>
            {displayName}
          </Text>
          <Text className="text-xs text-ink-soft">
            {relativeDate(review.created_at)}
          </Text>
        </View>
        <StarRatingDisplay value={review.rating} size={16} />
      </View>

      {review.comment ? (
        <Text className="mt-3 text-sm leading-5 text-ink">{review.comment}</Text>
      ) : null}

      <View className="mt-3 flex-row items-center justify-end">
        <ReviewVoteButtons
          reviewId={review.id}
          bookIsbn={bookIsbn}
          score={review.score}
        />
      </View>
    </View>
  );
}
