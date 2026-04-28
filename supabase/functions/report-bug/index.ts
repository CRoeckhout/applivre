// Edge function `report-bug`
// Reçoit un rapport de bug depuis l'app et crée une tâche dans ClickUp.
//
// Body : { title, description, screenshotUrl?, context? }
//   context = { appVersion, platform, osVersion, deviceModel?, locale? }
//
// Auth obligatoire (Bearer). Le token ClickUp et l'ID de la liste sont
// stockés en secrets Supabase :
//   supabase secrets set CLICKUP_TOKEN=pk_xxx
//   supabase secrets set CLICKUP_LIST_ID=901217583015
//
// Format réponse :
//   { ok: true, taskId, taskUrl }
//   { ok: false, error: 'unauthorized' | 'invalid_input' | 'upstream_error' | ... }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CLICKUP_TOKEN = Deno.env.get('CLICKUP_TOKEN') ?? '';
const CLICKUP_LIST_ID = Deno.env.get('CLICKUP_LIST_ID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ReportContext = {
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  deviceModel?: string;
  locale?: string;
};

type Payload = {
  title?: string;
  description?: string;
  screenshotUrl?: string;
  context?: ReportContext;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  if (!CLICKUP_TOKEN || !CLICKUP_LIST_ID) {
    return json({ ok: false, error: 'clickup_not_configured' }, 500);
  }

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
  const user = userData.user;

  // Username (best-effort) pour étoffer la description ClickUp.
  let username: string | null = null;
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: profile } = await admin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    username = (profile?.username as string | null) ?? null;
  } catch {
    // Ignoré : la tâche est créée sans username plutôt que de bloquer le flow.
  }

  // ─── Body ───
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const title = (body.title ?? '').trim();
  const description = (body.description ?? '').trim();
  const screenshotUrl = (body.screenshotUrl ?? '').trim();
  const ctx = body.context ?? {};

  if (title.length < 3 || title.length > 200) {
    return json({ ok: false, error: 'invalid_input', field: 'title' }, 400);
  }
  if (description.length > 5000) {
    return json({ ok: false, error: 'invalid_input', field: 'description' }, 400);
  }
  // Accepte http:// (Supabase Storage local sert en HTTP) ou https://.
  if (screenshotUrl && !/^https?:\/\//i.test(screenshotUrl)) {
    return json({ ok: false, error: 'invalid_input', field: 'screenshotUrl' }, 400);
  }

  // ─── Construction description ClickUp (Markdown) ───
  const lines: string[] = [];
  if (description) {
    lines.push(description, '');
  }
  lines.push('---');
  lines.push('**Reporter**');
  lines.push(`- User ID : \`${user.id}\``);
  if (user.email) lines.push(`- Email : ${user.email}`);
  if (username) lines.push(`- Username : @${username}`);
  lines.push('');
  lines.push('**Contexte**');
  if (ctx.appVersion) lines.push(`- App version : ${ctx.appVersion}`);
  if (ctx.platform) lines.push(`- Platform : ${ctx.platform}`);
  if (ctx.osVersion) lines.push(`- OS version : ${ctx.osVersion}`);
  if (ctx.deviceModel) lines.push(`- Device : ${ctx.deviceModel}`);
  if (ctx.locale) lines.push(`- Locale : ${ctx.locale}`);
  if (screenshotUrl) {
    lines.push('');
    lines.push('**Screenshot**');
    lines.push(`![screenshot](${screenshotUrl})`);
    lines.push(screenshotUrl);
  }
  const fullDescription = lines.join('\n');

  // ─── ClickUp call ───
  const endpoint = `https://api.clickup.com/api/v2/list/${encodeURIComponent(CLICKUP_LIST_ID)}/task`;
  let cuRes: Response;
  try {
    cuRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: CLICKUP_TOKEN,
      },
      body: JSON.stringify({
        name: title,
        markdown_content: fullDescription,
        tags: ['bug', 'in-app-report'],
      }),
    });
  } catch (e) {
    console.error('[report-bug] fetch error', e);
    return json({ ok: false, error: 'upstream_error' }, 502);
  }

  if (cuRes.status === 429) {
    return json({ ok: false, error: 'rate_limited' }, 429);
  }
  if (!cuRes.ok) {
    const text = await cuRes.text().catch(() => '');
    console.error('[report-bug] clickup', cuRes.status, text);
    return json({ ok: false, error: 'upstream_error', status: cuRes.status }, 502);
  }

  let cuJson: { id?: string; url?: string };
  try {
    cuJson = await cuRes.json();
  } catch {
    return json({ ok: false, error: 'invalid_response' }, 502);
  }

  return json({ ok: true, taskId: cuJson.id ?? null, taskUrl: cuJson.url ?? null });
});

function json(obj: unknown, status = 200): Response {
  // Log toute réponse non-2xx en stdout pour qu'elle apparaisse directement
  // dans l'onglet "Logs" du dashboard Supabase (sinon le body n'est pas
  // exposé, seulement le status code).
  if (status >= 400) {
    console.error(`[report-bug] ${status}`, JSON.stringify(obj));
  }
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}
