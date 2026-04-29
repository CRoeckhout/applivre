import { useEffect, useRef, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import type { BorderCatalogRow, BorderKind, BorderRepeatMode } from '../lib/types';

type Props = {
  initial: BorderCatalogRow | null;
  onSaved: (saved: BorderCatalogRow) => void;
  onDeleted: (key: string) => void;
};

export function BorderForm({ initial, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  const [borderKey, setBorderKey] = useState(initial?.border_key ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [kind, setKind] = useState<BorderKind>(initial?.kind ?? 'png_9slice');
  const [imageWidth, setImageWidth] = useState<string>(
    initial ? String(initial.image_width) : '32',
  );
  const [imageHeight, setImageHeight] = useState<string>(
    initial ? String(initial.image_height) : '32',
  );
  const [sliceTop, setSliceTop] = useState<string>(initial ? String(initial.slice_top) : '8');
  const [sliceRight, setSliceRight] = useState<string>(initial ? String(initial.slice_right) : '8');
  const [sliceBottom, setSliceBottom] = useState<string>(
    initial ? String(initial.slice_bottom) : '8',
  );
  const [sliceLeft, setSliceLeft] = useState<string>(initial ? String(initial.slice_left) : '8');
  const [bgInsetTop, setBgInsetTop] = useState<string>(
    initial?.bg_inset_top != null ? String(initial.bg_inset_top) : '',
  );
  const [bgInsetRight, setBgInsetRight] = useState<string>(
    initial?.bg_inset_right != null ? String(initial.bg_inset_right) : '',
  );
  const [bgInsetBottom, setBgInsetBottom] = useState<string>(
    initial?.bg_inset_bottom != null ? String(initial.bg_inset_bottom) : '',
  );
  const [bgInsetLeft, setBgInsetLeft] = useState<string>(
    initial?.bg_inset_left != null ? String(initial.bg_inset_left) : '',
  );
  const [repeatMode, setRepeatMode] = useState<BorderRepeatMode>(
    initial?.repeat_mode ?? 'stretch',
  );
  const [cardPadding, setCardPadding] = useState<string>(
    initial ? String(initial.card_padding) : '0',
  );
  const [tokensJson, setTokensJson] = useState(
    JSON.stringify(initial?.tokens ?? {}, null, 2),
  );
  const [isDefault, setIsDefault] = useState<boolean>(initial?.is_default ?? false);
  const [activeFrom, setActiveFrom] = useState(initial?.active_from?.slice(0, 16) ?? '');
  const [activeUntil, setActiveUntil] = useState(initial?.active_until?.slice(0, 16) ?? '');
  const [retiredAt, setRetiredAt] = useState(initial?.retired_at?.slice(0, 16) ?? '');

  const [storagePath, setStoragePath] = useState<string | null>(initial?.storage_path ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  // Pour SVG : payload inline (text du fichier .svg) au lieu d'upload bucket.
  const [payloadText, setPayloadText] = useState<string | null>(initial?.payload ?? null);
  const [pendingPayloadText, setPendingPayloadText] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Preview size — local-only, ne touche pas la row.
  const [previewW, setPreviewW] = useState(240);
  const [previewH, setPreviewH] = useState(140);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBorderKey(initial?.border_key ?? '');
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setKind(initial?.kind ?? 'png_9slice');
    setImageWidth(initial ? String(initial.image_width) : '32');
    setImageHeight(initial ? String(initial.image_height) : '32');
    setSliceTop(initial ? String(initial.slice_top) : '8');
    setSliceRight(initial ? String(initial.slice_right) : '8');
    setSliceBottom(initial ? String(initial.slice_bottom) : '8');
    setSliceLeft(initial ? String(initial.slice_left) : '8');
    setBgInsetTop(initial?.bg_inset_top != null ? String(initial.bg_inset_top) : '');
    setBgInsetRight(initial?.bg_inset_right != null ? String(initial.bg_inset_right) : '');
    setBgInsetBottom(initial?.bg_inset_bottom != null ? String(initial.bg_inset_bottom) : '');
    setBgInsetLeft(initial?.bg_inset_left != null ? String(initial.bg_inset_left) : '');
    setRepeatMode(initial?.repeat_mode ?? 'stretch');
    setCardPadding(initial ? String(initial.card_padding) : '0');
    setTokensJson(JSON.stringify(initial?.tokens ?? {}, null, 2));
    setIsDefault(initial?.is_default ?? false);
    setActiveFrom(initial?.active_from?.slice(0, 16) ?? '');
    setActiveUntil(initial?.active_until?.slice(0, 16) ?? '');
    setRetiredAt(initial?.retired_at?.slice(0, 16) ?? '');
    setStoragePath(initial?.storage_path ?? null);
    setPayloadText(initial?.payload ?? null);
    setPendingFile(null);
    setPendingPreview(null);
    setPendingPayloadText(null);
    setError(null);
    setSuccess(null);
  }, [initial]);

  let parsedTokens: Record<string, string> = {};
  let tokensError: string | null = null;
  try {
    const obj = JSON.parse(tokensJson);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      parsedTokens = obj as Record<string, string>;
    } else {
      tokensError = 'Tokens doivent être un objet JSON.';
    }
  } catch {
    tokensError = 'JSON invalide.';
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (kind === 'svg_9slice') {
      // SVG : on lit le text inline (stocké en payload), pas d'upload bucket.
      // Auto-detect dims via parsing viewBox / width-height attributes.
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        setPendingPayloadText(text);
        setPendingFile(null);
        const dims = extractSvgDims(text);
        if (dims) {
          setImageWidth(String(dims.w));
          setImageHeight(String(dims.h));
        }
        // Preview via data URI.
        setPendingPreview(`data:image/svg+xml;utf8,${encodeURIComponent(text)}`);
      };
      reader.readAsText(file);
      return;
    }

    // PNG / JPEG : upload bucket. Auto-detect dims via Image natif.
    setPendingFile(file);
    setPendingPayloadText(null);
    const url = URL.createObjectURL(file);
    setPendingPreview(url);
    if (file.type === 'image/png' || file.type === 'image/jpeg') {
      const img = new Image();
      img.onload = () => {
        setImageWidth(String(img.width));
        setImageHeight(String(img.height));
      };
      img.src = url;
    }
  }

  function clearPendingFile() {
    if (pendingPreview && pendingPreview.startsWith('blob:')) {
      URL.revokeObjectURL(pendingPreview);
    }
    setPendingFile(null);
    setPendingPreview(null);
    setPendingPayloadText(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadFileIfPending(): Promise<string | null> {
    if (!pendingFile) return storagePath;
    const ext = pendingFile.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${borderKey}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('border-graphics')
      .upload(path, pendingFile, {
        upsert: true,
        contentType: pendingFile.type || 'image/png',
      });
    if (upErr) throw new Error(`Upload échec : ${upErr.message}`);
    return path;
  }

  async function save() {
    setError(null);
    setSuccess(null);

    if (!borderKey || !title) {
      setError('border_key et titre requis');
      return;
    }
    if (tokensError) {
      setError(`Tokens : ${tokensError}`);
      return;
    }

    const iw = Number.parseInt(imageWidth, 10);
    const ih = Number.parseInt(imageHeight, 10);
    const st = Number.parseInt(sliceTop, 10);
    const sr = Number.parseInt(sliceRight, 10);
    const sb = Number.parseInt(sliceBottom, 10);
    const sl = Number.parseInt(sliceLeft, 10);
    if (![iw, ih, st, sr, sb, sl].every((n) => Number.isFinite(n) && n >= 0)) {
      setError('Dimensions et slices doivent être des entiers >= 0');
      return;
    }
    if (sl + sr > iw || st + sb > ih) {
      setError('Slices dépassent les dimensions de l\'image');
      return;
    }
    if (kind === 'png_9slice' && !pendingFile && !storagePath) {
      setError('PNG requis');
      return;
    }
    if (kind === 'svg_9slice' && !pendingPayloadText && !payloadText) {
      setError('SVG requis');
      return;
    }

    setSubmitting(true);
    try {
      const isSvg = kind === 'svg_9slice';
      const finalPath = isSvg ? null : await uploadFileIfPending();
      const finalPayload = isSvg ? (pendingPayloadText ?? payloadText) : null;

      const parseOptInt = (s: string): number | null => {
        const t = s.trim();
        if (t === '') return null;
        const n = Number.parseInt(t, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const row = {
        border_key: borderKey,
        title,
        description: description || null,
        kind,
        storage_path: finalPath,
        payload: finalPayload,
        image_width: iw,
        image_height: ih,
        slice_top: st,
        slice_right: sr,
        slice_bottom: sb,
        slice_left: sl,
        bg_inset_top: parseOptInt(bgInsetTop),
        bg_inset_right: parseOptInt(bgInsetRight),
        bg_inset_bottom: parseOptInt(bgInsetBottom),
        bg_inset_left: parseOptInt(bgInsetLeft),
        repeat_mode: repeatMode,
        card_padding: Math.max(0, Number.parseInt(cardPadding, 10) || 0),
        tokens: parsedTokens,
        is_default: isDefault,
        active_from: activeFrom ? new Date(activeFrom).toISOString() : null,
        active_until: activeUntil ? new Date(activeUntil).toISOString() : null,
        retired_at: retiredAt ? new Date(retiredAt).toISOString() : null,
      };
      const { data, error: upErr } = await supabase
        .from('border_catalog')
        .upsert(row, { onConflict: 'border_key' })
        .select()
        .single();
      if (upErr) {
        setError(`Save échec : ${upErr.message}`);
        return;
      }
      setStoragePath(finalPath);
      setPayloadText(finalPayload);
      clearPendingFile();
      setSuccess('Enregistré.');
      onSaved(data as BorderCatalogRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  async function retire() {
    if (!initial) return;
    if (!confirm(`Retirer le cadre "${initial.title}" ?`)) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('border_catalog')
      .update({ retired_at: new Date().toISOString() })
      .eq('border_key', initial.border_key);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted(initial.border_key);
  }

  async function unretire() {
    if (!initial) return;
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('border_catalog')
      .update({ retired_at: null })
      .eq('border_key', initial.border_key)
      .select()
      .single();
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(data as BorderCatalogRow);
  }

  const previewSrc = pendingPreview
    ? pendingPreview
    : storagePath
      ? `${SUPABASE_URL}/storage/v1/object/public/border-graphics/${storagePath}`
      : payloadText
        ? `data:image/svg+xml;utf8,${encodeURIComponent(payloadText)}`
        : null;

  return (
    <main style={{ flex: 1, padding: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 720, margin: '0 auto', padding: '0 24px 24px' }}>
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            background: 'var(--paper)',
            paddingTop: 16,
            paddingBottom: 12,
            borderBottom: '1px solid var(--line)',
            marginBottom: 16,
          }}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {previewSrc ? (
              <>
                <PreviewFrame
                  src={previewSrc}
                  sliceTop={Number.parseInt(sliceTop, 10) || 0}
                  sliceRight={Number.parseInt(sliceRight, 10) || 0}
                  sliceBottom={Number.parseInt(sliceBottom, 10) || 0}
                  sliceLeft={Number.parseInt(sliceLeft, 10) || 0}
                  bgInsetTop={resolveInset(bgInsetTop, sliceTop)}
                  bgInsetRight={resolveInset(bgInsetRight, sliceRight)}
                  bgInsetBottom={resolveInset(bgInsetBottom, sliceBottom)}
                  bgInsetLeft={resolveInset(bgInsetLeft, sliceLeft)}
                  repeatMode={repeatMode}
                  outerWidth={previewW}
                  outerHeight={previewH}
                />
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SizeSlider label="W" value={previewW} min={60} max={600} onChange={setPreviewW} />
                  <SizeSlider label="H" value={previewH} min={60} max={600} onChange={setPreviewH} />
                </div>
                <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
                  {previewW}×{previewH} — bg rouge = zone du bg appliqué dans l'app
                </div>
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12, padding: 24 }}>Sélectionne un PNG.</div>
            )}
          </div>
        </div>

        <div>
          <h2 style={{ marginTop: 0 }}>{isNew ? 'Nouveau cadre' : borderKey}</h2>

          <div className="field">
            <label>border_key</label>
            <input
              value={borderKey}
              onChange={(e) => setBorderKey(e.target.value)}
              disabled={!isNew}
              placeholder="ex: parchment_v1"
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
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', padding: '0 6px' }}>Visuel</legend>
            <div className="field">
              <label>Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as BorderKind)}>
                <option value="png_9slice">PNG 9-slice</option>
                <option value="svg_9slice">SVG 9-slice</option>
                <option value="lottie_9slice" disabled>Lottie 9-slice (à venir)</option>
              </select>
            </div>
            <div className="field">
              <label>Fichier ({kind === 'svg_9slice' ? '.svg' : '.png'})</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={kind === 'svg_9slice' ? 'image/svg+xml,.svg' : 'image/png'}
                onChange={handleFileSelect}
              />
              {pendingFile && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  En attente : {pendingFile.name} ({Math.round(pendingFile.size / 1024)} KB).
                  Sauvegarde l'entrée pour l'uploader.
                </div>
              )}
              {pendingPayloadText && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  En attente : SVG inline ({Math.round(pendingPayloadText.length / 1024)} KB).
                  Sauvegarde pour persister.
                </div>
              )}
              {!pendingFile && !pendingPayloadText && storagePath && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Existant : <code>{storagePath}</code>
                </div>
              )}
              {!pendingFile && !pendingPayloadText && !storagePath && payloadText && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  SVG inline existant ({Math.round(payloadText.length / 1024)} KB).
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Largeur (px)</label>
                <input type="number" min={1} value={imageWidth} onChange={(e) => setImageWidth(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Hauteur (px)</label>
                <input type="number" min={1} value={imageHeight} onChange={(e) => setImageHeight(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Slice top</label>
                <input type="number" min={0} value={sliceTop} onChange={(e) => setSliceTop(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Slice right</label>
                <input type="number" min={0} value={sliceRight} onChange={(e) => setSliceRight(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Slice bottom</label>
                <input type="number" min={0} value={sliceBottom} onChange={(e) => setSliceBottom(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Slice left</label>
                <input type="number" min={0} value={sliceLeft} onChange={(e) => setSliceLeft(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Bg inset top</label>
                <input type="number" min={0} placeholder="auto" value={bgInsetTop} onChange={(e) => setBgInsetTop(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Bg inset right</label>
                <input type="number" min={0} placeholder="auto" value={bgInsetRight} onChange={(e) => setBgInsetRight(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Bg inset bottom</label>
                <input type="number" min={0} placeholder="auto" value={bgInsetBottom} onChange={(e) => setBgInsetBottom(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Bg inset left</label>
                <input type="number" min={0} placeholder="auto" value={bgInsetLeft} onChange={(e) => setBgInsetLeft(e.target.value)} />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Distance depuis chaque bord externe vers l'intérieur où démarre le bg coloré (rouge dans la preview).
              Vide = auto (slice/2). À ajuster pour aligner le bg sur la position réelle de l'encre.
            </div>
            <div className="field">
              <label>Repeat</label>
              <select
                value={repeatMode}
                onChange={(e) => setRepeatMode(e.target.value as BorderRepeatMode)}>
                <option value="stretch">stretch — étire le slice</option>
                <option value="round">round — tile (count entier scalé)</option>
              </select>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Comportement des bandes edges/center. `round` pour les motifs répétitifs
                (chaînettes, guirlandes) ; `stretch` pour les bordures peintes uniques.
              </div>
            </div>
            <div className="field">
              <label>Card padding (px)</label>
              <input
                type="number"
                min={0}
                value={cardPadding}
                onChange={(e) => setCardPadding(e.target.value)}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Padding interne appliqué à la card quand ce cadre est actif (override les
                paddings hardcodés p-5/p-6 des composants). 0 = contenu collé aux edges
                intérieurs du frame.
              </div>
            </div>
            <div className="field">
              <label>Tokens (JSON)</label>
              <textarea
                rows={3}
                value={tokensJson}
                onChange={(e) => setTokensJson(e.target.value)}
                spellCheck={false}
              />
              {tokensError && <div className="error">{tokensError}</div>}
            </div>
          </fieldset>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', padding: '0 6px' }}>Visibilité</legend>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Disponible pour tous</span>
            </label>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Coché : visible et sélectionnable par tous les users sans unlock préalable.
              Décoché : verrouillé — le user doit débloquer le cadre (table user_borders) pour
              le voir apparaître dans le perso.
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

          <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 12, textAlign: 'center' }}>
            <div style={{ fontWeight: 600 }}>{title || '—'}</div>
            <div className="muted">{description || '—'}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Lit width/height intrinsèques d'un SVG : preference au viewBox (référence
// de coords du content), fallback sur les attributs width/height de la racine.
// Renvoie null si rien d'exploitable — l'admin devra saisir à la main.
function extractSvgDims(svgText: string): { w: number; h: number } | null {
  const tagMatch = svgText.match(/<svg\b[^>]*>/i);
  if (!tagMatch) return null;
  const tag = tagMatch[0];
  const vbMatch = tag.match(/\bviewBox\s*=\s*"([^"]+)"/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const w = Math.round(parts[2]);
      const h = Math.round(parts[3]);
      if (w > 0 && h > 0) return { w, h };
    }
  }
  const wMatch = tag.match(/\bwidth\s*=\s*"([\d.]+)/i);
  const hMatch = tag.match(/\bheight\s*=\s*"([\d.]+)/i);
  if (wMatch && hMatch) {
    const w = Math.round(Number.parseFloat(wMatch[1]));
    const h = Math.round(Number.parseFloat(hMatch[1]));
    if (w > 0 && h > 0) return { w, h };
  }
  return null;
}

// Slider + numeric input couplés pour resize la preview. State piloté
// par le parent ; min/max bornent les deux contrôles.
function SizeSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  function clamp(n: number) {
    if (!Number.isFinite(n)) return value;
    return Math.max(min, Math.min(max, Math.round(n)));
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 14, color: 'var(--ink-muted)' }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number.parseInt(e.target.value, 10)))}
        style={{ flex: 1 }}
      />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number.parseInt(e.target.value, 10)))}
        style={{ width: 56 }}
      />
    </div>
  );
}

// `resolveInset` calcule la valeur effective d'un bg inset : input vide ⇒
// auto = slice/2 (default app-side).
function resolveInset(value: string, sliceFallback: string): number {
  const t = value.trim();
  if (t === '') {
    const s = Number.parseInt(sliceFallback, 10);
    if (!Number.isFinite(s)) return 0;
    return Math.round(s / 2);
  }
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Preview web : layer rouge en absolu (= bg app rendu derrière) + slices PNG
// par-dessus via border-image. Le rouge n'est visible que là où le PNG est
// transparent ET où les bg insets le permettent — exactement comme dans l'app.
function PreviewFrame({
  src,
  sliceTop,
  sliceRight,
  sliceBottom,
  sliceLeft,
  bgInsetTop,
  bgInsetRight,
  bgInsetBottom,
  bgInsetLeft,
  repeatMode,
  outerWidth,
  outerHeight,
}: {
  src: string;
  sliceTop: number;
  sliceRight: number;
  sliceBottom: number;
  sliceLeft: number;
  bgInsetTop: number;
  bgInsetRight: number;
  bgInsetBottom: number;
  bgInsetLeft: number;
  repeatMode: BorderRepeatMode;
  outerWidth: number;
  outerHeight: number;
}) {
  return (
    <div style={{ position: 'relative', width: outerWidth, height: outerHeight }}>
      <div
        style={{
          position: 'absolute',
          top: bgInsetTop,
          right: bgInsetRight,
          bottom: bgInsetBottom,
          left: bgInsetLeft,
          backgroundColor: '#ff0000',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxSizing: 'border-box',
          borderStyle: 'solid',
          borderColor: 'transparent',
          borderTopWidth: sliceTop,
          borderRightWidth: sliceRight,
          borderBottomWidth: sliceBottom,
          borderLeftWidth: sliceLeft,
          borderImage: `url(${src}) ${sliceTop} ${sliceRight} ${sliceBottom} ${sliceLeft} fill / ${sliceTop}px ${sliceRight}px ${sliceBottom}px ${sliceLeft}px ${repeatMode}`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
