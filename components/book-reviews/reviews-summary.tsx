// Bloc agrégat "Commentaires client" : moyenne, total, distribution 1..5
// en barres. Inspiré du layout Amazon mais aux couleurs Grimolia.
//
// Affiché même si total = 0 (état vide encourageant la première note).

import { Reviews } from '@grimolia/social';
import { Text, View } from 'react-native';
import { StarRatingDisplay } from './star-rating';

type Props = {
  payload: Reviews.BookReviewsPayload;
};

const STARS_ORDER: Array<keyof Reviews.RatingDistribution> = [5, 4, 3, 2, 1];

export function ReviewsSummary({ payload }: Props) {
  const { avg, total, distribution } = payload;

  if (total === 0) {
    return (
      <View className="rounded-3xl bg-paper-warm p-5">
        <Text className="font-display text-xl text-ink">Avis lecteurs</Text>
        <Text className="mt-2 text-sm text-ink-soft">
          Aucun avis pour ce livre. Sois le premier à donner ton avis !
        </Text>
      </View>
    );
  }

  return (
    <View className="rounded-3xl bg-paper-warm p-5">
      <Text className="font-display text-xl text-ink">Avis lecteurs</Text>

      <View className="mt-3 flex-row items-center gap-2">
        <StarRatingDisplay value={avg ?? 0} size={20} allowHalf />
        <Text className="text-base text-ink">
          {avg != null ? avg.toFixed(1).replace('.', ',') : '—'}{' '}
          <Text className="text-ink-soft">sur 5</Text>
        </Text>
      </View>
      <Text className="mt-1 text-sm text-ink-soft">
        {total} évaluation{total > 1 ? 's' : ''}
      </Text>

      <View className="mt-4 gap-2">
        {STARS_ORDER.map((star) => {
          const count = distribution[star] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <View key={star} className="flex-row items-center gap-3">
              <Text className="w-16 text-sm text-ink-soft">
                {star} étoile{star > 1 ? 's' : ''}
              </Text>
              <View className="h-3 flex-1 overflow-hidden rounded-full bg-paper">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: '#f4a623' }}
                />
              </View>
              <Text className="w-10 text-right text-sm text-ink-soft">
                {pct}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
