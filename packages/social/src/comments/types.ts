import type { SocialProfile } from '../profile';
import type { UserId } from '../types';

export type Comment = {
  id: string;
  user_id: UserId;
  // Pour un root comment, parent_id = null. Threading limité à 1 niveau côté
  // schéma (cf. 0044) — pas de reply de reply.
  parent_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  // Profil snapshot inline — évite N+1 sur les listes.
  actor: SocialProfile;
  // Nombre de réponses non-deleted (root only — replies n'ont pas elles-mêmes
  // d'enfants par contrainte d'API).
  replies_count: number;
  // Réactions sur ce commentaire (toutes types confondues pour le verrou
  // d'édition ; côté UI on affiche surtout `like`).
  like_count: number;
  my_like: boolean;
  // True si l'auth.uid() courant peut éditer : auteur, non-deleted, 0 reply,
  // 0 réaction. Calculé serveur.
  is_editable: boolean;
};
