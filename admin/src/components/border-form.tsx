import { useEffect, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import type { BorderCatalogRow, BorderRepeatMode, CatalogAvailability } from '../lib/types';
import {
  AvailabilityFieldset,
  KindFileFieldset,
  PeriodFieldset,
  SizeSlider,
  TokensField,
  applySvgPreviewOverrides,
  parseOptInt,
  type DecorationKind,
} from './decoration-fields';

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
  const [kind, setKind] = useState<DecorationKind>(initial?.kind ?? 'png_9slice');
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
  const [availability, setAvailability] = useState<CatalogAvailability>(
    initial?.availability ?? 'badge',
  );
  const [activeFrom, setActiveFrom] = useState(initial?.active_from?.slice(0, 16) ?? '');
  const [activeUntil, setActiveUntil] = useState(initial?.active_until?.slice(0, 16) ?? '');
  const [retiredAt, setRetiredAt] = useState(initial?.retired_at?.slice(0, 16) ?? '');

  const [storagePath, setStoragePath] = useState<string | null>(initial?.storage_path ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [payloadText, setPayloadText] = useState<string | null>(initial?.payload ?? null);
  const [pendingPayloadText, setPendingPayloadText] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [previewW, setPreviewW] = useState(240);
  const [previewH, setPreviewH] = useState(140);
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string>>({});

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
    setAvailability(initial?.availability ?? 'badge');
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
    setPreviewOverrides({});
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

  function clearPendingFile() {
    if (pendingPreview && pendingPreview.startsWith('blob:')) {
      URL.revokeObjectURL(pendingPreview);
    }
    setPendingFile(null);
    setPendingPreview(null);
    setPendingPayloadText(null);
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
      setError("Slices dépassent les dimensions de l'image");
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
        availability,
        unlock_badge_key: initial?.unlock_badge_key ?? null,
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

  const isSvgKind = kind === 'svg_9slice';
  const effectiveSvgText = isSvgKind
    ? applySvgPreviewOverrides(
        pendingPayloadText ?? payloadText,
        parsedTokens,
        previewOverrides,
      )
    : null;

  const previewSrc = isSvgKind
    ? effectiveSvgText
      ? `data:image/svg+xml;utf8,${encodeURIComponent(effectiveSvgText)}`
      : null
    : pendingPreview
      ? pendingPreview
      : storagePath
        ? `${SUPABASE_URL}/storage/v1/object/public/border-graphics/${storagePath}`
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
                  {previewW}×{previewH} — bg rouge = zone du bg appliqué dans l&apos;app
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
            <KindFileFieldset
              kind={kind}
              setKind={setKind}
              pendingFile={pendingFile}
              setPendingFile={setPendingFile}
              pendingPayloadText={pendingPayloadText}
              setPendingPayloadText={setPendingPayloadText}
              setPendingPreview={setPendingPreview}
              storagePath={storagePath}
              payloadText={payloadText}
              onDetectedDims={(w, h) => {
                setImageWidth(String(w));
                setImageHeight(String(h));
              }}
            />
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
              Distance depuis chaque bord externe vers l&apos;intérieur où démarre le bg coloré (rouge dans la preview).
              Vide = auto (slice/2). À ajuster pour aligner le bg sur la position réelle de l&apos;encre.
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
            <TokensField
              tokensJson={tokensJson}
              setTokensJson={setTokensJson}
              previewOverrides={previewOverrides}
              setPreviewOverrides={setPreviewOverrides}
              parsedTokens={parsedTokens}
              tokensError={tokensError}
            />
          </fieldset>

          <AvailabilityFieldset
            availability={availability}
            setAvailability={setAvailability}
            helper="Disponible pour tous : utilisable sans condition. Premium : visible avec étoile, paywall au clic si non-premium. Obtention d'un badge : caché tant que le badge n'est pas obtenu (unlock via user_borders). À l'unité : à venir."
          />

          <PeriodFieldset
            activeFrom={activeFrom}
            setActiveFrom={setActiveFrom}
            activeUntil={activeUntil}
            setActiveUntil={setActiveUntil}
            retiredAt={retiredAt}
            setRetiredAt={setRetiredAt}
          />

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

// `resolveInset` calcule la valeur effective d'un bg inset : input vide ⇒
// auto = slice/2 (default app-side). Spécifique au cadre, pas factorisé.
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
