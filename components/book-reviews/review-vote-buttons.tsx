// Boutons up/down sur un avis. Toggle :
//   - tap up alors que vote = +1     → unvote
//   - tap up alors que vote = -1     → flip à +1
//   - tap up alors que vote = null   → +1
//
// Optimistic via useVoteReview (le score affiché vient du parent).

import { useAuth } from '@/hooks/use-auth';
import { MaterialIcons } from '@expo/vector-icons';
import { Reviews } from '@grimolia/social';
import { Pressable, Text, View } from 'react-native';

type Props = {
  reviewId: string;
  bookIsbn: string;
  score: number;
};

const ACCENT = '#8e5dc8';

export function ReviewVoteButtons({ reviewId, bookIsbn, score }: Props) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const myVoteQuery = Reviews.useMyReviewVote(userId, reviewId);
  const myVote = myVoteQuery.data ?? null;

  const voteMut = Reviews.useVoteReview(userId, bookIsbn);

  const cast = (target: Reviews.ReviewVoteValue) => {
    if (!userId || voteMut.isPending) return;
    voteMut.mutate({ reviewId, next: myVote === target ? null : target });
  };

  const upActive = myVote === 1;
  const downActive = myVote === -1;

  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        onPress={() => cast(1)}
        hitSlop={8}
        accessibilityLabel="Voter pour cet avis"
        className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${
          upActive ? 'bg-accent-pale' : 'bg-paper'
        } active:opacity-70`}
      >
        <MaterialIcons
          name="thumb-up"
          size={16}
          color={upActive ? ACCENT : '#6b6259'}
        />
      </Pressable>

      <Text className="min-w-[24px] text-center text-sm text-ink">
        {score > 0 ? `+${score}` : score}
      </Text>

      <Pressable
        onPress={() => cast(-1)}
        hitSlop={8}
        accessibilityLabel="Voter contre cet avis"
        className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${
          downActive ? 'bg-paper-shade' : 'bg-paper'
        } active:opacity-70`}
      >
        <MaterialIcons
          name="thumb-down"
          size={16}
          color={downActive ? '#b8503a' : '#6b6259'}
        />
      </Pressable>
    </View>
  );
}
