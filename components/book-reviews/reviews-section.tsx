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
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ReviewCard } from './review-card';
import { ReviewFormModal } from './review-form-modal';
import { ReviewsSummary } from './reviews-summary';
import { ShareReviewModal } from './share-review-modal';

type Props = {
  bookIsbn: string;
  bookTitle: string;
  // Avis à la une : id de l'avis à cibler (scroll + surbrillance) + callback de
  // scroll fourni par la page livre (qui possède la ScrollView).
  highlightReviewId?: string | null;
  scrollIntoView?: (node: View) => void;
};

export function ReviewsSection({
  bookIsbn,
  bookTitle,
  highlightReviewId = null,
  scrollIntoView,
}: Props) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const reviewsQuery = Reviews.useBookReviews(bookIsbn);
  const myReviewQuery = Reviews.useMyReview(userId, bookIsbn);

  // Cible du deep-link : on attache un ref à la carte ciblée, et une fois la
  // liste chargée + le layout posé, on scrolle dessus et on l'allume.
  const targetRef = useRef<View>(null);
  const [highlightOn, setHighlightOn] = useState(false);
  const didHighlightRef = useRef(false);

  useEffect(() => {
    if (!highlightReviewId || didHighlightRef.current) return;
    const found = reviewsQuery.data?.reviews.some(
      (r) => r.id === highlightReviewId,
    );
    if (!found) return;
    didHighlightRef.current = true;
    const t = setTimeout(() => {
      if (targetRef.current && scrollIntoView) scrollIntoView(targetRef.current);
      setHighlightOn(true);
    }, 450);
    return () => clearTimeout(t);
  }, [highlightReviewId, reviewsQuery.data, scrollIntoView]);

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
          {payload.reviews.map((r) => {
            const isTarget = r.id === highlightReviewId;
            return (
              <ReviewCard
                key={r.id}
                review={r}
                bookIsbn={bookIsbn}
                containerRef={isTarget ? targetRef : undefined}
                highlighted={isTarget && highlightOn}
              />
            );
          })}
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
