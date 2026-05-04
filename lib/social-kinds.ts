// Enregistrement des kinds + resolvers de Grimolia auprès du package
// @grimolia/social. Le package est domain-agnostic : il délègue à Grimolia
// la résolution des objets (livres, fiches, bingos) et des profils. Tout ce
// qui doit être branché à l'app hôte vit ici.
//
// Importé une fois au boot (cf. app/_layout.tsx) pour que les side-effects
// soient en place avant le premier rendu.

import {
  configureProfileResolver,
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

// Les registerKind('book' / 'sheet' / 'bingo', ...) viendront quand on
// branchera les features qui en ont besoin (réactions, feed). Pour l'instant
// la slice "partage de fiches" n'utilise que le profile lens.
