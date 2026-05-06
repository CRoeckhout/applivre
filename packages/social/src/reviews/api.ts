import { getClient } from '../client';
import type { SocialProfile, SocialProfileAppearance } from '../profile';
import type { UserId } from '../types';
import type {
  BookReview,
  BookReviewsPayload,
  RatingDistribution,
  ReviewVoteValue,
} from './types';

// Forme brute renvoyée par get_book_reviews (jsonb).
type RawAuthor = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_premium: boolean | null;
  appearance: SocialProfileAppearance | null;
};

type RawReview = {
  id: string;
  user_id: string;
  book_isbn: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  score: number;
  author: RawAuthor;
};

type RawPayload = {
  avg: number | null;
  total: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  reviews: RawReview[];
};

const EMPTY_DISTRIBUTION: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

function mapAuthor(raw: RawAuthor): SocialProfile {
  return {
    id: raw.id,
    username: raw.username,
    display_name: raw.display_name,
    avatar_url: raw.avatar_url,
    is_premium: raw.is_premium ?? false,
    appearance: raw.appearance,
  };
}

function mapReview(raw: RawReview): BookReview {
  return {
    id: raw.id,
    user_id: raw.user_id,
    book_isbn: raw.book_isbn,
    rating: raw.rating,
    comment: raw.comment,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    score: raw.score ?? 0,
    author: mapAuthor(raw.author),
  };
}

function mapPayload(raw: RawPayload | null): BookReviewsPayload {
  if (!raw) {
    return { avg: null, total: 0, distribution: { ...EMPTY_DISTRIBUTION }, reviews: [] };
  }
  return {
    avg: raw.avg,
    total: raw.total ?? 0,
    distribution: {
      1: raw.distribution?.['1'] ?? 0,
      2: raw.distribution?.['2'] ?? 0,
      3: raw.distribution?.['3'] ?? 0,
      4: raw.distribution?.['4'] ?? 0,
      5: raw.distribution?.['5'] ?? 0,
    },
    reviews: (raw.reviews ?? []).map(mapReview),
  };
}

export async function fetchBookReviews(
  bookIsbn: string,
): Promise<BookReviewsPayload> {
  const { data, error } = await getClient().rpc('get_book_reviews', {
    p_book_isbn: bookIsbn,
  });
  if (error) throw error;
  return mapPayload(data as RawPayload | null);
}

// Lecture d'un avis isolé : utilisé par le KindAdapter quand le feed
// renvoie target_kind='review'. La table est en lecture publique
// (cf. RLS book_reviews_select_all) — pas besoin d'RPC SECURITY DEFINER.
export async function fetchReview(reviewId: string): Promise<BookReview | null> {
  const { data, error } = await getClient()
    .from('book_reviews')
    .select('id, user_id, book_isbn, rating, comment, created_at, updated_at')
    .eq('id', reviewId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Score agrégé : sum(value) sur les votes. Pas de RPC dédié — c'est un
  // appel one-shot à l'ouverture d'un permalink, pas un hot path.
  const { data: votes, error: voteErr } = await getClient()
    .from('book_reviews_votes')
    .select('value')
    .eq('review_id', reviewId);
  if (voteErr) throw voteErr;
  const score = (votes ?? []).reduce(
    (sum, v) => sum + ((v as { value: number }).value ?? 0),
    0,
  );

  // Profil minimal — l'auteur sera enrichi via useProfile() côté UI si
  // un rendu plus riche est nécessaire.
  return {
    id: data.id,
    user_id: data.user_id,
    book_isbn: data.book_isbn,
    rating: data.rating,
    comment: data.comment,
    created_at: data.created_at,
    updated_at: data.updated_at,
    score,
    author: {
      id: data.user_id,
      username: null,
      display_name: null,
      avatar_url: null,
      is_premium: false,
      appearance: null,
    },
  };
}

export type UpsertReviewInput = {
  bookIsbn: string;
  rating: number;
  comment?: string | null;
};

// Crée ou met à jour l'avis d'un user pour un livre. Renvoie la row mise
// à jour. La contrainte unique (user_id, book_isbn) garantit l'unicité.
export async function upsertReview(
  currentUserId: UserId,
  input: UpsertReviewInput,
): Promise<{ id: string; created: boolean }> {
  const client = getClient();

  // On distingue create / update pour pouvoir savoir s'il faut afficher la
  // modale de partage (uniquement à la création — cf. spec).
  const existing = await client
    .from('book_reviews')
    .select('id')
    .eq('user_id', currentUserId)
    .eq('book_isbn', input.bookIsbn)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    const { error } = await client
      .from('book_reviews')
      .update({
        rating: input.rating,
        comment: input.comment ?? null,
      })
      .eq('id', existing.data.id);
    if (error) throw error;
    return { id: existing.data.id, created: false };
  }

  const { data, error } = await client
    .from('book_reviews')
    .insert({
      user_id: currentUserId,
      book_isbn: input.bookIsbn,
      rating: input.rating,
      comment: input.comment ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await getClient()
    .from('book_reviews')
    .delete()
    .eq('id', reviewId);
  if (error) throw error;
}

// Émission explicite au feed (one-shot, "Non merci" = ne pas appeler).
// Idempotent côté SQL : ré-appel ne crée pas de doublon.
export async function publishReviewToFeed(
  reviewId: string,
  postText?: string | null,
): Promise<string> {
  const { data, error } = await getClient().rpc('publish_review_to_feed', {
    p_review_id: reviewId,
    p_post_text: postText ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function voteReview(
  reviewId: string,
  value: ReviewVoteValue,
): Promise<void> {
  const { error } = await getClient().rpc('vote_book_review', {
    p_review_id: reviewId,
    p_value: value,
  });
  if (error) throw error;
}

export async function unvoteReview(reviewId: string): Promise<void> {
  const { error } = await getClient().rpc('unvote_book_review', {
    p_review_id: reviewId,
  });
  if (error) throw error;
}

// Vote courant de l'user sur un avis (utile pour highlight le bouton
// up/down). Renvoie null si l'user n'a pas voté.
export async function getMyVote(
  currentUserId: UserId,
  reviewId: string,
): Promise<ReviewVoteValue | null> {
  const { data, error } = await getClient()
    .from('book_reviews_votes')
    .select('value')
    .eq('review_id', reviewId)
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = (data as { value: number }).value;
  return v === 1 || v === -1 ? (v as ReviewVoteValue) : null;
}

// Avis personnel de l'user sur un livre (s'il existe). Utilisé pour
// pré-remplir le formulaire d'édition.
export async function getMyReview(
  currentUserId: UserId,
  bookIsbn: string,
): Promise<{
  id: string;
  rating: number;
  comment: string | null;
} | null> {
  const { data, error } = await getClient()
    .from('book_reviews')
    .select('id, rating, comment')
    .eq('user_id', currentUserId)
    .eq('book_isbn', bookIsbn)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
