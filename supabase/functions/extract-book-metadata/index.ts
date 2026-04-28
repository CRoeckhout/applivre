// Edge function `extract-book-metadata`
// Reçoit { isbn, title, authors, categories } bruts → demande à Groq d'extraire
// un titre propre + auteurs propres + catégories normalisées.
//
// Déclenché manuellement depuis l'admin via bouton "Compléter avec l'IA".
// Auth obligatoire + is_admin vérifié. Le post-traitement automatique des
// livres scannés est porté par `resolve-book` (qui appelle directement le
// helper partagé `_shared/groq-cleanup.ts` côté serveur).
//
// Format réponse :
//   { ok: true, cleaned: { title, authors[], categories[], confidence } }
//   { ok: false, error: 'rate_limited' | 'upstream_error' | 'invalid_response' | ... }
//
// Déploiement : `supabase functions deploy extract-book-metadata`
// Secret : `supabase secrets set GROQ_API_KEY=xxx`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { cleanWithGroq, GROQ_MODEL } from '../_shared/groq-cleanup.ts';

const GROQ_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Payload = {
  isbn?: string;
  title?: string;
  authors?: string[];
  categories?: string[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  if (!GROQ_KEY) return json({ ok: false, error: 'groq_key_missing' }, 500);

  // ─── Auth ───
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profErr || !profile?.is_admin) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  // ─── Body ───
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const outcome = await cleanWithGroq(
    {
      isbn: body.isbn,
      title: body.title,
      authors: body.authors,
      categories: body.categories,
    },
    GROQ_KEY,
  );

  if (!outcome.ok) {
    const status = outcome.error === 'rate_limited' ? 429 : outcome.error === 'empty_input' ? 400 : 502;
    return json({ ok: false, error: outcome.error }, status);
  }
  return json({ ok: true, model: GROQ_MODEL, cleaned: outcome.cleaned });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}
