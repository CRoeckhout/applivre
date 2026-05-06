// Bloc "Avis lecteurs" sur la page livre. Pilote :
//   - le summary (avg + distribution),
//   - le CTA "Donner mon avis" / "Modifier mon avis",
//   - la liste des avis avec commentaire,
//   - les modales formulaire et partage.
//
// Flow CTA :
//   1. tap CTA → ouvre la review-form modal
//   2. submit  → si created=true, ferme form et ouvre share-modal
//                 si created=false (édition), ferme simplement
//   3. share-modal "Publier" / "Non merci" → ferme (cf. spec : pas de
//      seconde chance, "Non merci" est définitif)

import { useAuth } from '@/hooks/use-auth';
import { MaterialIcons } from '@expo/vector-icons';
import { Reviews } from '@grimolia/social';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ReviewCard } from './review-card';
import { ReviewFormModal } from './review-form-modal';
import { ReviewsSummary } from './reviews-summary';
import { ShareReviewModal } from './share-review-modal';

type Props = {
  bookIsbn: string;
  bookTitle: string;
};

export function ReviewsSection({ bookIsbn, bookTitle }: Props) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const reviewsQuery = Reviews.useBookReviews(bookIsbn);
  const myReviewQuery = Reviews.useMyReview(userId, bookIsbn);

  const [formOpen, setFormOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);

  const hasMyReview = Boolean(myReviewQuery.data);

  const handleSubmitted = ({
    reviewId,
    created,
  }: {
    reviewId: string;
    created: boolean;
  }) => {
    setFormOpen(false);
    if (created) {
      setPendingReviewId(reviewId);
      setShareOpen(true);
    }
  };

  const handleShareClose = () => {
    setShareOpen(false);
    setPendingReviewId(null);
  };

  if (reviewsQuery.isLoading) {
    return (
      <View className="mt-8 items-center py-6">
        <ActivityIndicator />
      </View>
    );
  }

  const payload =
    reviewsQuery.data ?? {
      avg: null,
      total: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      reviews: [],
    };

  return (
    <View className="mt-8">
      <ReviewsSummary payload={payload} />

      {userId ? (
        <Pressable
          onPress={() => setFormOpen(true)}
          className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 active:opacity-80"
          accessibilityLabel={
            hasMyReview ? 'Modifier mon avis' : 'Donner mon avis'
          }
        >
          <MaterialIcons
            name={hasMyReview ? 'edit' : 'rate-review'}
            size={18}
            color="#fbf8f4"
          />
          <Text className="font-sans-med text-paper">
            {hasMyReview ? 'Modifier mon avis' : 'Donner mon avis'}
          </Text>
        </Pressable>
      ) : null}

      {payload.reviews.length > 0 ? (
        <View className="mt-6 gap-3">
          {payload.reviews.map((r) => (
            <ReviewCard key={r.id} review={r} bookIsbn={bookIsbn} />
          ))}
        </View>
      ) : null}

      <ReviewFormModal
        open={formOpen}
        bookIsbn={bookIsbn}
        bookTitle={bookTitle}
        onClose={() => setFormOpen(false)}
        onSubmitted={handleSubmitted}
      />
      <ShareReviewModal
        open={shareOpen}
        reviewId={pendingReviewId}
        bookTitle={bookTitle}
        onClose={handleShareClose}
      />
    </View>
  );
}
