// Types des avis publics sur livres.
//
// `BookReview` est l'objet exposé côté UI. Il agrège la note, le
// commentaire (optionnel mais nécessaire pour apparaître dans la liste),
// le score net des votes, et un snapshot du profil de l'auteur.

import type { SocialProfile } from '../profile';
import type { UserId } from '../types';

export type BookReview = {
  id: string;
  user_id: UserId;
  book_isbn: string;
  rating: number; // 1..5
  comment: string | null;
  created_at: string;
  updated_at: string;
  // Score net = sum(value) sur book_reviews_votes (votes +1 / -1).
  score: number;
  author: SocialProfile;
};

// Distribution des notes : nombre d'avis pour chaque score 1..5,
// indépendamment de la présence d'un commentaire.
export type RatingDistribution = {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
};

// Payload retourné par get_book_reviews. `avg` peut être null si aucun
// avis n'a encore été déposé sur le livre.
export type BookReviewsPayload = {
  avg: number | null;
  total: number;
  distribution: RatingDistribution;
  // Liste filtrée : uniquement les avis qui ont un commentaire non vide,
  // triés par score desc, puis created_at desc.
  reviews: BookReview[];
};

export type ReviewVoteValue = -1 | 1;
