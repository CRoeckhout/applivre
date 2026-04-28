// Helper partagé : appel Groq pour nettoyer titre + auteurs + catégories
// d'un livre. Utilisé par :
//   - extract-book-metadata (déclenchement manuel admin via bouton "IA")
//   - resolve-book (post-merge automatique pour livres frais)
//
// Le prompt système est tenu ici pour rester aligné entre les deux flows.

export const GROQ_MODEL = 'llama-3.1-8b-instant';
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export type GroqCleanInput = {
  isbn?: string;
  title?: string;
  authors?: string[];
  categories?: string[];
};

export type GroqCleanResult = {
  title: string;
  authors: string[];
  categories: string[];
  confidence: number;
};

export type GroqCleanError =
  | 'groq_key_missing'
  | 'empty_input'
  | 'rate_limited'
  | 'upstream_error'
  | 'invalid_response';

export type GroqCleanOutcome =
  | { ok: true; cleaned: GroqCleanResult; model: string }
  | { ok: false; error: GroqCleanError; status?: number };

const SYSTEM_PROMPT = `Tu es un assistant qui nettoie des métadonnées de livres provenant de catalogues bibliographiques bruyants (BNF, OpenLibrary, Google Books, ISBN-DB).

Tu reçois un JSON avec : isbn, title, authors[], categories[].

Tu retournes STRICTEMENT un JSON avec ce schéma :
{
  "title": string,         // titre canonique du livre. Voir règles ci-dessous.
  "authors": string[],     // auteurs principaux uniquement, "Prénom Nom" propre. Exclure traducteurs, illustrateurs, préfaciers, éditeurs.
  "categories": string[],  // genres normalisés en français, courts (1-3 mots), max 5 entrées. Pas de doublons sémantiques. Si une catégorie contient " & " ou " and ", scinde-la en plusieurs entrées indépendantes (ex: "Literature & Fiction" → ["Littérature","Fiction"]).
  "confidence": number     // 0..1 — ta confiance dans le résultat global.
}

Règles titre :
- Garde le titre principal et, s'il existe, le sous-titre lisible (séparé par " : ", " - ", " — ").
- Garde la mention de tome/volume si elle est dans le titre source : "Tome N", "T N", "Volume N", "Vol. N". Préfère le format "Tome N" canonique. Garde aussi le titre du tome (ex: "Tome 2 : Les Braises de la Reine").
- Supprime toute mention d'édition ou de format : "édition reliée", "édition collector", "édition de poche", "édition spéciale", "édition limitée", "édition illustrée", "édition Jaspage", "édition originale", "broché", "relié", "grand format", "poche", "(édition X)", "(version Y)", etc. Cas-insensible, avec ou sans accents, avec ou sans parenthèses.
- Supprime les chiffres entre parenthèses redondants avec le tome déjà mentionné : "Tome 2 ... (2)" → "Tome 2 ...".
- Supprime les mentions de traducteur, illustrateur, préfacier, série en préfixe/suffixe ainsi que les séparateurs orphelins (" / ", " ; ", " . ", points isolés).
- Normalise les espaces : un seul espace entre les mots, pas d'espace avant la ponctuation française autre que celle prévue (": " "; " "! " "? ").
- Conserve la casse d'origine pour le titre et garde les accents et apostrophes français (' " ' ").

Exemples :
Input : {"title":"Cinder / Marissa Meyer ; traduit de l'anglais (États-Unis) par Guillaume Fournier","authors":["Marissa Meyer","Guillaume Fournier"],"categories":["Young adult fiction","Science fiction"]}
Output : {"title":"Cinder","authors":["Marissa Meyer"],"categories":["Young Adult","Science-fiction"],"confidence":0.95}

Input : {"title":"L'Étranger","authors":["Albert Camus"],"categories":["Fiction"]}
Output : {"title":"L'Étranger","authors":["Albert Camus"],"categories":["Roman"],"confidence":0.9}

Input : {"title":"Les Sept Maris d'Evelyn Hugo","authors":["Taylor Jenkins Reid"],"categories":["Literature & Fiction","Genre Fiction","Teen & Young Adult","Science Fiction & Fantasy"]}
Output : {"title":"Les Sept Maris d'Evelyn Hugo","authors":["Taylor Jenkins Reid"],"categories":["Littérature","Fiction","Young Adult","Science-fiction","Fantasy"],"confidence":0.9}

Input : {"title":"Peau d'âme - Tome 2 Les Braises de la Reine (2)","authors":["Pierre Bottero"],"categories":["Fantasy"]}
Output : {"title":"Peau d'âme - Tome 2 : Les Braises de la Reine","authors":["Pierre Bottero"],"categories":["Fantasy"],"confidence":0.9}

Input : {"title":"Le Pont des tempêtes, T5 : Le Trône tourmenté (édition reliée)","authors":["Robin Hobb"],"categories":["Fantasy"]}
Output : {"title":"Le Pont des tempêtes, Tome 5 : Le Trône tourmenté","authors":["Robin Hobb"],"categories":["Fantasy"],"confidence":0.9}

Input : {"title":"Le serpent et le descendant de la Nuit Edition Jaspage","authors":["Anne Robillard"],"categories":["Fantasy"]}
Output : {"title":"Le serpent et le descendant de la Nuit","authors":["Anne Robillard"],"categories":["Fantasy"],"confidence":0.9}

Input : {"title":"Les Mondes d'Ewilan L'intégrale . Edition collector","authors":["Pierre Bottero"],"categories":["Fantasy","Young adult"]}
Output : {"title":"Les Mondes d'Ewilan : L'intégrale","authors":["Pierre Bottero"],"categories":["Fantasy","Young Adult"],"confidence":0.9}

Si l'input est vide ou inexploitable, retourne le titre/auteurs tels quels et confidence: 0.

Ne renvoie QUE le JSON, sans texte autour, sans markdown.`;

export async function cleanWithGroq(
  input: GroqCleanInput,
  groqKey: string,
): Promise<GroqCleanOutcome> {
  if (!groqKey) return { ok: false, error: 'groq_key_missing' };

  const normalized = {
    isbn: (input.isbn ?? '').trim(),
    title: (input.title ?? '').trim(),
    authors: Array.isArray(input.authors)
      ? input.authors.filter((s): s is string => typeof s === 'string')
      : [],
    categories: Array.isArray(input.categories)
      ? input.categories.filter((s): s is string => typeof s === 'string')
      : [],
  };
  if (
    !normalized.title &&
    normalized.authors.length === 0 &&
    normalized.categories.length === 0
  ) {
    return { ok: false, error: 'empty_input' };
  }

  let res: Response;
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(normalized) },
        ],
      }),
    });
  } catch (e) {
    console.error('[groq-cleanup] fetch error', e);
    return { ok: false, error: 'upstream_error' };
  }

  if (res.status === 429) return { ok: false, error: 'rate_limited', status: 429 };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[groq-cleanup] groq', res.status, text);
    return { ok: false, error: 'upstream_error', status: res.status };
  }

  let payload: { choices?: { message?: { content?: string } }[] };
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: 'invalid_response' };
  }
  const content = payload.choices?.[0]?.message?.content ?? '';
  const cleaned = parseCleaned(content);
  if (!cleaned) {
    console.error('[groq-cleanup] parse fail', content);
    return { ok: false, error: 'invalid_response' };
  }
  return { ok: true, cleaned, model: GROQ_MODEL };
}

function parseCleaned(raw: string): GroqCleanResult | null {
  try {
    const obj = JSON.parse(raw) as Partial<GroqCleanResult>;
    if (typeof obj.title !== 'string') return null;
    if (!Array.isArray(obj.authors)) return null;
    if (!Array.isArray(obj.categories)) return null;
    const confidence =
      typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
        ? Math.max(0, Math.min(1, obj.confidence))
        : 0;
    return {
      title: obj.title.trim(),
      authors: obj.authors
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim()),
      categories: obj.categories
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim()),
      confidence,
    };
  } catch {
    return null;
  }
}
