// Edge function `extract-book-metadata`
// Reçoit { isbn, title, authors, categories } bruts → demande à Groq d'extraire
// un titre propre + auteurs propres + catégories normalisées.
//
// Phase 1 : déclenché manuellement depuis l'admin via bouton "Compléter avec
// l'IA". Auth obligatoire + is_admin vérifié.
//
// Phase 2 (futur) : appelé en post-traitement après chaque scan ISBN. Le flag
// `is_admin` sera assoupli pour accepter tout `authenticated`. Voir le commentaire
// `ADMIN_GATE` plus bas.
//
// Format réponse :
//   { ok: true, cleaned: { title, authors[], categories[], confidence } }
//   { ok: false, error: 'rate_limited' | 'upstream_error' | 'invalid_response' | ... }
//
// Déploiement : `supabase functions deploy extract-book-metadata`
// Secret : `supabase secrets set GROQ_API_KEY=xxx`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// Modèle Groq utilisé pour l'extraction. À pinner ici pour pouvoir tester
// `llama-3.3-70b-versatile` (qualité) vs `llama-3.1-8b-instant` (latence/free
// tier large) sans toucher au reste.
const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const GROQ_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ADMIN_GATE — phase 1 only. Mettre à `false` quand le scan flow utilisera
// l'endpoint pour tout user authentifié.
const REQUIRE_ADMIN = true;

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

type Cleaned = {
  title: string;
  authors: string[];
  categories: string[];
  confidence: number;
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

  if (REQUIRE_ADMIN) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profErr || !profile?.is_admin) {
      return json({ ok: false, error: 'forbidden' }, 403);
    }
  }

  // ─── Body ───
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const input = {
    isbn: (body.isbn ?? '').trim(),
    title: (body.title ?? '').trim(),
    authors: Array.isArray(body.authors) ? body.authors.filter((s) => typeof s === 'string') : [],
    categories: Array.isArray(body.categories)
      ? body.categories.filter((s) => typeof s === 'string')
      : [],
  };
  if (!input.title && input.authors.length === 0 && input.categories.length === 0) {
    return json({ ok: false, error: 'empty_input' }, 400);
  }

  // ─── Groq call ───
  let groqRes: Response;
  try {
    groqRes = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
    });
  } catch (e) {
    console.error('[extract-book-metadata] fetch error', e);
    return json({ ok: false, error: 'upstream_error' }, 502);
  }

  if (groqRes.status === 429) {
    return json({ ok: false, error: 'rate_limited' }, 429);
  }
  if (!groqRes.ok) {
    const text = await groqRes.text().catch(() => '');
    console.error('[extract-book-metadata] groq', groqRes.status, text);
    return json({ ok: false, error: 'upstream_error', status: groqRes.status }, 502);
  }

  let groqJson: { choices?: { message?: { content?: string } }[] };
  try {
    groqJson = await groqRes.json();
  } catch {
    return json({ ok: false, error: 'invalid_response' }, 502);
  }
  const content = groqJson.choices?.[0]?.message?.content ?? '';
  const cleaned = parseCleaned(content);
  if (!cleaned) {
    console.error('[extract-book-metadata] parse fail', content);
    return json({ ok: false, error: 'invalid_response' }, 502);
  }

  return json({ ok: true, model: GROQ_MODEL, cleaned });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function parseCleaned(raw: string): Cleaned | null {
  try {
    const obj = JSON.parse(raw) as Partial<Cleaned>;
    if (typeof obj.title !== 'string') return null;
    if (!Array.isArray(obj.authors)) return null;
    if (!Array.isArray(obj.categories)) return null;
    const confidence =
      typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
        ? Math.max(0, Math.min(1, obj.confidence))
        : 0;
    return {
      title: obj.title.trim(),
      authors: obj.authors.filter((s): s is string => typeof s === 'string').map((s) => s.trim()),
      categories: obj.categories
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim()),
      confidence,
    };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `Tu es un assistant qui nettoie des métadonnées de livres provenant de catalogues bibliographiques bruyants (BNF, OpenLibrary, Google Books).

Tu reçois un JSON avec : isbn, title, authors[], categories[].

Tu retournes STRICTEMENT un JSON avec ce schéma :
{
  "title": string,         // titre canonique du livre, sans mention de traducteur, illustrateur, série, ni séparateurs comme " / " ou " ; ".
  "authors": string[],     // auteurs principaux uniquement, "Prénom Nom" propre. Exclure traducteurs, illustrateurs, préfaciers, éditeurs.
  "categories": string[],  // genres normalisés en français, courts (1-3 mots), max 5 entrées. Pas de doublons sémantiques.
  "confidence": number     // 0..1 — ta confiance dans le résultat global.
}

Exemples :
Input : {"title":"Cinder / Marissa Meyer ; traduit de l'anglais (États-Unis) par Guillaume Fournier","authors":["Marissa Meyer","Guillaume Fournier"],"categories":["Young adult fiction","Science fiction"]}
Output : {"title":"Cinder","authors":["Marissa Meyer"],"categories":["Young Adult","Science-fiction"],"confidence":0.95}

Input : {"title":"L'Étranger","authors":["Albert Camus"],"categories":["Fiction"]}
Output : {"title":"L'Étranger","authors":["Albert Camus"],"categories":["Roman"],"confidence":0.9}

Si l'input est vide ou inexploitable, retourne le titre/auteurs tels quels et confidence: 0.

Ne renvoie QUE le JSON, sans texte autour, sans markdown.`;
