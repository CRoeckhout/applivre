// Body du verbe `posted_review` dans le feed. Affiche :
//   - le post_text (s'il a été ajouté dans la modale de partage)
//   - la note 5★ + commentaire de l'avis (lus depuis meta + fetch review)
//   - une carte cliquable vers /book/[isbn]
//
// `meta` porte book_isbn / rating / post_text. La review elle-même est
// chargée à part pour récupérer le `comment` (qui peut différer du
// `post_text` — c'est l'artefact attaché au livre).

import { BookCover } from '@/components/book-cover';
import { StarRatingDisplay } from '@/components/book-reviews/star-rating';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

type ReviewMeta = {
  book_isbn?: string;
  rating?: number;
  post_text?: string;
};

type ReviewLite = {
  id: string;
  comment: string | null;
};

type BookLite = {
  isbn: string;
  title: string;
  cover_url: string | null;
  authors: string[] | null;
};

async function fetchReviewLite(reviewId: string): Promise<ReviewLite | null> {
  const { data, error } = await supabase
    .from('book_reviews')
    .select('id, comment')
    .eq('id', reviewId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ReviewLite | null;
}

async function fetchBookLite(isbn: string): Promise<BookLite | null> {
  const { data, error } = await supabase
    .from('books')
    .select('isbn, title, cover_url, authors')
    .eq('isbn', isbn)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as BookLite | null;
}

export function PostedReviewBody({
  reviewId,
  meta,
}: {
  reviewId: string;
  meta: ReviewMeta;
}) {
  const router = useRouter();
  const bookIsbn = meta.book_isbn ?? null;
  const rating = typeof meta.rating === 'number' ? meta.rating : 0;
  const postText =
    typeof meta.post_text === 'string' && meta.post_text.trim().length > 0
      ? meta.post_text
      : null;

  const reviewQuery = useQuery({
    queryKey: ['feed', 'review-lite', reviewId],
    queryFn: () => fetchReviewLite(reviewId),
    enabled: Boolean(reviewId),
    staleTime: 1000 * 60,
  });

  const bookQuery = useQuery({
    queryKey: ['feed', 'book-lite', bookIsbn ?? ''],
    queryFn: () => fetchBookLite(bookIsbn!),
    enabled: Boolean(bookIsbn),
    staleTime: 1000 * 60 * 10,
  });

  const comment = reviewQuery.data?.comment ?? null;
  const book = bookQuery.data;

  return (
    <View className="p-4">
      {postText ? (
        <Text className="text-base leading-5 text-ink">{postText}</Text>
      ) : null}

      {book ? (
        <Pressable
          onPress={() => router.push(`/book/${book.isbn}`)}
          className="mt-3 flex-row items-center gap-3 rounded-2xl bg-paper p-3 active:opacity-80"
        >
          <BookCover
            isbn={book.isbn}
            coverUrl={book.cover_url ?? undefined}
            style={{ width: 52, height: 78, borderRadius: 6 }}
            placeholderText=""
            transition={150}
          />
          <View className="flex-1">
            <Text className="font-display text-base text-ink" numberOfLines={2}>
              {book.title}
            </Text>
            {book.authors && book.authors.length > 0 ? (
              <Text className="mt-0.5 text-xs text-ink-soft" numberOfLines={1}>
                {book.authors.join(', ')}
              </Text>
            ) : null}
            <View className="mt-2">
              <StarRatingDisplay value={rating} size={14} />
            </View>
          </View>
        </Pressable>
      ) : null}

      {comment ? (
        <View className="mt-3 rounded-2xl bg-paper p-3">
          <Text className="text-sm leading-5 text-ink">{comment}</Text>
        </View>
      ) : null}
    </View>
  );
}
