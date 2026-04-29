import { useEffect, useState } from 'react';
import { BadgeGraphicWeb } from '../lib/badge-graphic';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import {
  RULE_TYPES_WITH_MIN,
  type BadgeCatalogRow,
  type GraphicKind,
  type Rule,
  type RuleType,
} from '../lib/types';

type Props = {
  initial: BadgeCatalogRow | null; // null = nouvelle entrée
  onSaved: (saved: BadgeCatalogRow) => void;
  onDeleted: (key: string) => void;
};

// Path normalisé (espaces explicites + leading zeros) pour passer le parser
// strict de Fabric/iOS qui refuse les compact decimals chainées.
const DEFAULT_SVG =
  '<svg viewBox="0 0 509.18 496.7" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M 255.59 0.65 l -1 -0.65 -1 0.65 C 124.31 84.74 11.2 96.11 0 82.35 c 74.02 394.36 192.65 340.34 253.59 413.14 l 1 1.21 1 -1.21 c 60.94 -72.8 179.57 -18.78 253.59 -413.14 -11.2 13.76 -124.31 2.39 -253.59 -81.7 Z" fill="{{primary}}"/>' +
  '<path d="M 224.51 440.15 c -58.01 -22.61 -100.94 -73.26 -126.94 -128.78 -26.88 -56.28 -41.4 -117.45 -52.64 -178.15 0 0 91.05 -5.07 91.05 -5.07 -5.55 83.33 -8.32 171.76 32.1 247.32 13.83 25.16 33.06 47.37 56.43 64.69 h 0 Z" fill="#ffffff" fill-opacity="0.85"/>' +
  '<text x="254.59" y="290" fill="#ffffff" font-size="220" font-weight="700" text-anchor="middle">{{label}}</text>' +
  '</svg>';

export function BadgeForm({ initial, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  const [badgeKey, setBadgeKey] = useState(initial?.badge_key ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [ruleType, setRuleType] = useState<RuleType>(
    (initial?.rule.type ?? 'sheets_count') as RuleType,
  );
  const [ruleMin, setRuleMin] = useState<string>(
    initial?.rule && 'min' in initial.rule ? String(initial.rule.min) : '1',
  );
  const [graphicKind, setGraphicKind] = useState<GraphicKind>(
    initial?.graphic_kind ?? 'svg',
  );
  const [graphicPayload, setGraphicPayload] = useState(
    initial?.graphic_payload ?? DEFAULT_SVG,
  );
  const [graphicTokensJson, setGraphicTokensJson] = useState(
    JSON.stringify(initial?.graphic_tokens ?? { primary: '#c27b52', label: '' }, null, 2),
  );
  const [activeFrom, setActiveFrom] = useState(initial?.active_from?.slice(0, 16) ?? '');
  const [activeUntil, setActiveUntil] = useState(initial?.active_until?.slice(0, 16) ?? '');
  const [retiredAt, setRetiredAt] = useState(initial?.retired_at?.slice(0, 16) ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset le form quand initial change (sélection liste).
  useEffect(() => {
    setBadgeKey(initial?.badge_key ?? '');
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setRuleType((initial?.rule.type ?? 'sheets_count') as RuleType);
    setRuleMin(initial?.rule && 'min' in initial.rule ? String(initial.rule.min) : '1');
    setGraphicKind(initial?.graphic_kind ?? 'svg');
    setGraphicPayload(initial?.graphic_payload ?? DEFAULT_SVG);
    setGraphicTokensJson(
      JSON.stringify(initial?.graphic_tokens ?? { primary: '#c27b52', label: '' }, null, 2),
    );
    setActiveFrom(initial?.active_from?.slice(0, 16) ?? '');
    setActiveUntil(initial?.active_until?.slice(0, 16) ?? '');
    setRetiredAt(initial?.retired_at?.slice(0, 16) ?? '');
    setError(null);
    setSuccess(null);
  }, [initial]);

  let parsedTokens: Record<string, string> = {};
  let tokensError: string | null = null;
  try {
    const obj = JSON.parse(graphicTokensJson);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      parsedTokens = obj as Record<string, string>;
    } else {
      tokensError = 'Tokens doivent être un objet JSON.';
    }
  } catch {
    tokensError = 'JSON invalide.';
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setGraphicPayload(text);
    e.target.value = '';
  }

  function switchKind(next: GraphicKind) {
    if (next === graphicKind) return;
    setGraphicKind(next);
    // Reset payload + tokens vers les defaults du nouveau kind.
    if (next === 'svg') {
      setGraphicPayload(DEFAULT_SVG);
      setGraphicTokensJson(
        JSON.stringify({ primary: '#c27b52', label: '' }, null, 2),
      );
    } else {
      // Lottie : payload vide → placeholder dans la preview jusqu'à coller un JSON.
      setGraphicPayload('');
      setGraphicTokensJson('{}');
    }
  }

  async function save() {
    setError(null);
    setSuccess(null);

    if (!badgeKey || !title || !description) {
      setError('badge_key, titre et description requis');
      return;
    }
    if (tokensError) {
      setError(`Tokens : ${tokensError}`);
      return;
    }

    let rule: Rule;
    if (RULE_TYPES_WITH_MIN.includes(ruleType)) {
      const min = Number.parseInt(ruleMin, 10);
      if (!Number.isFinite(min) || min < 1) {
        setError('min doit être un entier >= 1');
        return;
      }
      rule = { type: ruleType, min } as Rule;
    } else {
      rule = { type: ruleType } as Rule;
    }

    setSubmitting(true);
    try {
      // 1) Sanitize SVG via Edge Function (qui vérifie aussi is_admin).
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        setError('Session expirée');
        return;
      }
      const sanitizeRes = await fetch(
        `${SUPABASE_URL}/functions/v1/validate-badge-graphic`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ kind: graphicKind, payload: graphicPayload }),
        },
      );
      const sanitizeBody = await sanitizeRes.json();
      if (!sanitizeRes.ok || !sanitizeBody.ok) {
        setError(
          `Sanitize échec : ${sanitizeBody.error ?? 'unknown'}${
            sanitizeBody.reason ? ` (${sanitizeBody.reason})` : ''
          }`,
        );
        return;
      }
      const sanitizedPayload: string = sanitizeBody.payload;

      // 2) Upsert dans badge_catalog.
      const row = {
        badge_key: badgeKey,
        title,
        description,
        rule,
        graphic_kind: graphicKind,
        graphic_payload: sanitizedPayload,
        graphic_tokens: parsedTokens,
        active_from: activeFrom ? new Date(activeFrom).toISOString() : null,
        active_until: activeUntil ? new Date(activeUntil).toISOString() : null,
        retired_at: retiredAt ? new Date(retiredAt).toISOString() : null,
      };
      const { data, error: upsertErr } = await supabase
        .from('badge_catalog')
        .upsert(row, { onConflict: 'badge_key' })
        .select()
        .single();
      if (upsertErr) {
        setError(`Save échec : ${upsertErr.message}`);
        return;
      }

      setSuccess('Enregistré.');
      onSaved(data as BadgeCatalogRow);
    } finally {
      setSubmitting(false);
    }
  }

  async function retire() {
    if (!initial) return;
    if (!confirm(`Retirer le badge "${initial.title}" ? Les utilisateurs qui l'ont déjà obtenu le conservent.`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('badge_catalog')
      .update({ retired_at: new Date().toISOString() })
      .eq('badge_key', initial.badge_key);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted(initial.badge_key);
  }

  async function unretire() {
    if (!initial) return;
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('badge_catalog')
      .update({ retired_at: null })
      .eq('badge_key', initial.badge_key)
      .select()
      .single();
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(data as BadgeCatalogRow);
  }

  return (
    <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>
        <div>
          <h2 style={{ marginTop: 0 }}>{isNew ? 'Nouveau badge' : badgeKey}</h2>

          <div className="field">
            <label>badge_key</label>
            <input
              value={badgeKey}
              onChange={(e) => setBadgeKey(e.target.value)}
              disabled={!isNew}
              placeholder="ex: sheets_count:5"
            />
            {!isNew && <div className="muted" style={{ fontSize: 12 }}>Non modifiable après création.</div>}
          </div>

          <div className="field">
            <label>Titre</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', padding: '0 6px' }}>Règle</legend>
            <div className="field">
              <label>Type</label>
              <select value={ruleType} onChange={(e) => setRuleType(e.target.value as RuleType)}>
                <option value="first_sheet">first_sheet</option>
                <option value="first_bingo">first_bingo</option>
                <option value="sheets_count">sheets_count</option>
                <option value="books_read">books_read</option>
                <option value="bingo_completed">bingo_completed</option>
                <option value="streak_max">streak_max</option>
              </select>
            </div>
            {RULE_TYPES_WITH_MIN.includes(ruleType) && (
              <div className="field">
                <label>min (seuil)</label>
                <input
                  type="number"
                  min={1}
                  value={ruleMin}
                  onChange={(e) => setRuleMin(e.target.value)}
                />
              </div>
            )}
          </fieldset>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', padding: '0 6px' }}>Visuel</legend>
            <div className="field">
              <label>Type</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {(['svg', 'lottie'] as const).map((k) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={graphicKind === k}
                      onChange={() => switchKind(k)}
                    />
                    <span style={{ textTransform: 'uppercase', fontSize: 12, fontWeight: 600 }}>{k}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>{graphicKind === 'svg' ? 'Upload SVG (.svg)' : 'Upload Lottie (.json)'}</label>
              <input
                type="file"
                accept={graphicKind === 'svg' ? '.svg,image/svg+xml' : '.json,application/json'}
                onChange={handleFileUpload}
              />
            </div>
            <div className="field">
              <label>Payload {graphicKind === 'svg' ? '(SVG XML)' : '(Lottie JSON)'}</label>
              <textarea
                rows={10}
                value={graphicPayload}
                onChange={(e) => setGraphicPayload(e.target.value)}
                spellCheck={false}
              />
              <div className="muted" style={{ fontSize: 12 }}>
                {graphicKind === 'svg' ? (
                  <>Tokens : <code>{`{{name}}`}</code>. Sanitizé serveur (script / on* / refs externes refusés).</>
                ) : (
                  <>Lottie JSON sanitizé serveur (expressions / assets externes refusés). Max 500KB.</>
                )}
              </div>
            </div>
            <div className="field">
              <label>Tokens (JSON)</label>
              <textarea
                rows={4}
                value={graphicTokensJson}
                onChange={(e) => setGraphicTokensJson(e.target.value)}
                spellCheck={false}
              />
              <div className="muted" style={{ fontSize: 12 }}>
                {graphicKind === 'svg' ? (
                  <>Mapping <code>{`{{key}}`}</code> → valeur (text replace).</>
                ) : (
                  <>Mapping <code>"layer_name"</code> → <code>"#hex"</code> (colorFilters au render).</>
                )}
              </div>
              {tokensError && <div className="error">{tokensError}</div>}
            </div>
          </fieldset>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', padding: '0 6px' }}>Période</legend>
            <div className="field">
              <label>active_from</label>
              <input type="datetime-local" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>active_until</label>
              <input type="datetime-local" value={activeUntil} onChange={(e) => setActiveUntil(e.target.value)} />
            </div>
            <div className="field">
              <label>retired_at</label>
              <input type="datetime-local" value={retiredAt} onChange={(e) => setRetiredAt(e.target.value)} />
            </div>
          </fieldset>

          {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
          {success && <div className="success" style={{ marginBottom: 12 }}>{success}</div>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={save} disabled={submitting}>
              {submitting ? 'Enregistrement…' : isNew ? 'Créer' : 'Enregistrer'}
            </button>
            {!isNew && initial?.retired_at === null && (
              <button className="btn btn-danger" onClick={retire} disabled={submitting}>
                Retirer
              </button>
            )}
            {!isNew && initial?.retired_at !== null && (
              <button className="btn" onClick={unretire} disabled={submitting}>
                Réactiver
              </button>
            )}
          </div>
        </div>

        <div style={{ position: 'sticky', top: 24 }}>
          <h3 style={{ marginTop: 0 }}>Preview</h3>
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <BadgeGraphicWeb kind={graphicKind} payload={graphicPayload} tokens={parsedTokens} size={140} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <BadgeGraphicWeb kind={graphicKind} payload={graphicPayload} tokens={parsedTokens} size={32} />
              <BadgeGraphicWeb kind={graphicKind} payload={graphicPayload} tokens={parsedTokens} size={48} />
              <BadgeGraphicWeb kind={graphicKind} payload={graphicPayload} tokens={parsedTokens} size={64} />
            </div>
            <div style={{ borderTop: '1px solid var(--line)', width: '100%', paddingTop: 12, textAlign: 'center' }}>
              <div style={{ fontWeight: 600 }}>{title || '—'}</div>
              <div className="muted">{description || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
