// Edge function `validate-badge-graphic`
// Sanitize un payload graphique avant écriture dans badge_catalog.
// Supporte SVG (XML) et Lottie (JSON).
//
// Threat model : un compte admin (RLS profiles.is_admin) peut potentiellement
// coller du payload malveillant (SVG : script, on*, refs externes — Lottie :
// expressions JS, assets URLs externes). On parse, on filtre, on rejette.
//
// Déploiement : `supabase functions deploy validate-badge-graphic`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_SVG_BYTES = 100 * 1024; // 100KB
const MAX_LOTTIE_BYTES = 500 * 1024; // 500KB (vector + timeline = plus volumineux)

// Allowlist : balises SVG sûres pour rendu via react-native-svg.
// Tout le reste est rejeté (script, foreignObject, iframe, object, etc.).
// `style` accepté pour les exports AI/Figma/Sketch qui utilisent des
// class selectors (.st0 etc). Le contenu CSS est validé séparément.
// IMPORTANT : tags lowercase car deno-dom parse en mode HTML qui casefold
// les noms de balises (linearGradient → lineargradient).
const ALLOWED_TAGS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'lineargradient', 'radialgradient', 'stop',
  'text', 'tspan',
  'clippath', 'mask', 'pattern',
  'title', 'desc',
  'filter', 'fegaussianblur', 'feoffset', 'femerge', 'femergenode',
  'fecolormatrix', 'fecomposite', 'feflood',
  'style',
]);

// Patterns CSS interdits dans les blocs <style>.
// Note : `url(#...)` est OK (référence interne aux <defs>), seul l'externe
// est rejeté.
const FORBIDDEN_CSS_RE = [
  /@import\b/i,
  /expression\s*\(/i,
  /javascript\s*:/i,
  /url\s*\(\s*['"]?\s*(?:https?:|\/\/|data:(?!image\/))/i,
  /behavior\s*:/i,
];

// Attributs interdits explicitement (en plus du filtre on*).
const FORBIDDEN_ATTRS = new Set([
  'onload', 'onclick', 'onerror', 'onmouseover', 'onmouseenter',
  'onmouseleave', 'onfocus', 'onblur', 'oninput', 'onchange',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── Auth : vérifie que l'appelant est un admin ──
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'missing_auth' }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'invalid_auth' }, 401);

  const { data: profile } = await db
    .from('profiles')
    .select('is_admin')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return json({ error: 'forbidden' }, 403);

  // ── Parse body ──
  let body: { kind?: string; payload?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const kind = body.kind;
  if (kind !== 'svg' && kind !== 'lottie') {
    return json({ error: 'unsupported_kind' }, 400);
  }
  const payload = typeof body.payload === 'string' ? body.payload : '';
  if (!payload) return json({ error: 'empty_payload' }, 400);

  if (kind === 'svg') {
    if (payload.length > MAX_SVG_BYTES) {
      return json({ error: 'payload_too_large', max: MAX_SVG_BYTES }, 413);
    }
    const reason = validateSvgPayload(payload);
    if (reason) return json({ error: 'sanitize_rejected', reason }, 400);
    return json({ ok: true, kind: 'svg', payload });
  }

  // kind === 'lottie'
  if (payload.length > MAX_LOTTIE_BYTES) {
    return json({ error: 'payload_too_large', max: MAX_LOTTIE_BYTES }, 413);
  }
  const lottieResult = validateLottiePayload(payload);
  if ('reason' in lottieResult) {
    return json({ error: 'sanitize_rejected', reason: lottieResult.reason }, 400);
  }
  // Lottie : on retourne le JSON re-stringifié canoniquement (parser a
  // déjà accepté ⇒ valeurs propres).
  return json({ ok: true, kind: 'lottie', payload: lottieResult.payload });
});

// ═════════════ SVG ═════════════

function validateSvgPayload(payload: string): string | null {
  const lower = payload.toLowerCase();
  if (
    lower.includes('<!entity') ||
    lower.includes('<!doctype') ||
    /\son\w+\s*=/.test(lower) ||
    /javascript\s*:/.test(lower)
  ) {
    return 'forbidden_pattern';
  }

  // Validation parser-based, NO re-serialization (cf. note historique).
  try {
    return validateSvg(payload);
  } catch (err) {
    return `parse_failed:${String(err).slice(0, 64)}`;
  }
}

// Walk le DOM parsé, retourne une raison si violation, null si propre.
function validateSvg(svg: string): string | null {
  const doc = new DOMParser().parseFromString(svg, 'text/html');
  if (!doc) return 'parse_null';

  const root = doc.querySelector('svg');
  if (!root) return 'no_svg_root';

  return walk(root);
}

function walk(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    return `disallowed_tag:${tag}`;
  }

  // Bloc <style> : valider le contenu CSS (pas d'@import, url() externes, etc.)
  if (tag === 'style') {
    const css = el.textContent ?? '';
    for (const re of FORBIDDEN_CSS_RE) {
      if (re.test(css)) return `forbidden_css:${re.source.slice(0, 32)}`;
    }
  }

  for (const attr of el.attributes) {
    const name = attr.name.toLowerCase();
    const value = attr.value ?? '';

    if (name.startsWith('on') || FORBIDDEN_ATTRS.has(name)) {
      return `forbidden_attr:${name}`;
    }

    if (name === 'href' || name === 'xlink:href') {
      const v = value.trim().toLowerCase();
      const safeRef = v.startsWith('#') || v.startsWith('data:image/');
      if (!safeRef) return `forbidden_href:${value.slice(0, 64)}`;
    }

    if (name === 'style' && /url\s*\(\s*['"]?\s*(?!#)/i.test(value)) {
      return `forbidden_style_url`;
    }
  }

  for (const child of Array.from(el.children)) {
    const reason = walk(child as unknown as Element);
    if (reason) return reason;
  }
  return null;
}

// ═════════════ Lottie ═════════════

// Champs de propriété Lottie qui contiennent une expression JS (After Effects
// expressions). Évalués par certains players → surface attaque si payload
// admin compromis. On reject toute présence.
const LOTTIE_EXPRESSION_KEYS = new Set(['x']); // bodymovin convention

// Layer types Lottie acceptés. Refuse tout type inconnu / dangereux.
const LOTTIE_ALLOWED_LAYER_TYPES = new Set([
  0, // precomp
  1, // solid
  2, // image (validé séparément contre URL externe)
  3, // null
  4, // shape
  5, // text
  6, // audio (rare, on accepte mais pas joué côté RN)
]);

function validateLottiePayload(
  payload: string,
): { payload: string } | { reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { reason: 'invalid_json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { reason: 'not_object' };
  }
  const obj = parsed as Record<string, unknown>;

  // Champs requis Lottie minimum
  for (const k of ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers']) {
    if (!(k in obj)) return { reason: `missing_field:${k}` };
  }
  if (!Array.isArray(obj.layers)) return { reason: 'layers_not_array' };

  // Walk récursif : refuser expressions + URLs externes.
  const violation = walkLottie(obj);
  if (violation) return { reason: violation };

  // Re-stringify canoniquement (compact, pas d'espaces excédentaires).
  return { payload: JSON.stringify(obj) };
}

function walkLottie(node: unknown, path = ''): string | null {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const r = walkLottie(node[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  // Layer type whitelist
  if (typeof obj.ty === 'number' && path.includes('layers[')) {
    if (!LOTTIE_ALLOWED_LAYER_TYPES.has(obj.ty)) {
      return `forbidden_layer_type:${obj.ty}`;
    }
  }

  // Asset avec URL externe
  // Lottie asset shape: { id, w, h, u: 'urlPrefix/', p: 'file.png' }
  if (typeof obj.u === 'string') {
    const u = obj.u.trim();
    if (u.length > 0 && !u.startsWith('data:image/')) {
      return `forbidden_asset_url:${u.slice(0, 64)}`;
    }
  }
  if (typeof obj.p === 'string') {
    const p = obj.p.trim().toLowerCase();
    // p légitime = nom de fichier OU data URI image
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('//')) {
      return `forbidden_asset_path:${p.slice(0, 64)}`;
    }
    if (p.startsWith('data:') && !p.startsWith('data:image/')) {
      return `forbidden_asset_data:${p.slice(0, 32)}`;
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    // Expressions AE : champ `x` au niveau d'une propriété animée.
    // Bodymovin sérialise comme string contenant du JS.
    if (
      LOTTIE_EXPRESSION_KEYS.has(key) &&
      typeof value === 'string' &&
      value.length > 0 &&
      // distinguer des x:[0.5] easing arrays — on ne refuse que les strings JS
      /[a-zA-Z_$]/.test(value)
    ) {
      return `forbidden_expression:${key}`;
    }
    const r = walkLottie(value, path ? `${path}.${key}` : key);
    if (r) return r;
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}
