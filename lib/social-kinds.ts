// Enregistrement des kinds + resolvers de Grimolia auprès du package
// @grimolia/social. Le package est domain-agnostic : il délègue à Grimolia
// la résolution des objets (livres, fiches, bingos) et des profils. Tout ce
// qui doit être branché à l'app hôte vit ici.
//
// Importé une fois au boot (cf. app/_layout.tsx) pour que les side-effects
// soient en place avant le premier rendu.

import {
  configureProfileResolver,
  registerKind,
  Reviews,
  type SocialProfile,
} from '@grimolia/social';

import { supabase } from '@/lib/supabase';

// Profile lens — query la fonction SECURITY DEFINER `get_public_profiles`
// (cf. migration 0048) qui ne renvoie QUE les colonnes d'identité publiques.
configureProfileResolver(async (userIds) => {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase.rpc('get_public_profiles', {
    p_user_ids: userIds,
  });
  if (error) throw error;
  const map: Record<string, SocialProfile> = {};
  for (const row of (data ?? []) as SocialProfile[]) {
    map[row.id] = row;
  }
  return map;
});

// Kind 'sheet' — fiche de lecture publique. Le fetcher renvoie le bundle
// minimal exposé par get_public_sheet (titre, auteur, isbn) qui sert à
// afficher des cards/previews dans le feed ou des notifs. Le rendu visuel
// fidèle vit dans /sheet/view/[id], pas ici.
registerKind('sheet', {
  fetch: async (id: string) => {
    const { data, error } = await supabase.rpc('get_public_sheet', {
      p_sheet_id: id,
    });
    if (error) throw error;
    return ((data ?? [])[0] as Record<string, unknown> | undefined) ?? null;
  },
  routeTo: (id: string) => `/sheet/view/${id}`,
  // Cf. ClickUp item 7 : "Possibilité de réaction sur les fiches de lectures (👍 et ♥️)".
  allowedReactions: ['like', 'love'],
});

// Kind 'review' — avis public sur livre. Le feed renvoie target_kind='review'
// + meta { book_isbn, rating, post_text } ; le fetcher hydrate le contenu
// (comment + score) si l'UI a besoin de plus que ce que le meta porte.
// La route mène vers la page du livre (l'avis y est ancré, pas de page
// dédiée pour l'instant).
registerKind('review', {
  fetch: async (id: string) => Reviews.fetchReview(id),
  // Pas de routeTo synchrone : la cible est /book/[isbn] mais l'isbn est
  // dans meta.book_isbn (côté feed entry), pas dérivable de l'id seul.
  // Le feed UI lira le meta directement pour router.
  //
  // Pas de réactions emoji sur les reviews — les votes up/down vivent dans
  // book_reviews_votes, distincts de social_reactions.
});

// Les autres registerKind ('book', 'bingo'…) viendront quand on branchera
// les features qui en ont besoin.
