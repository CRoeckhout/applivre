import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import type {
  BorderBandMode,
  BorderCatalogRow,
  BorderRepeatMode,
  BorderSliceExtras,
  CatalogAvailability,
} from '../lib/types';

// Slice extras vide pour init manuel : grille 1×1 (aucun cut, mode=repeat).
function emptyExtras(fallback: BorderRepeatMode): BorderSliceExtras {
  return { cutsX: [], cutsY: [], modes: [[fallback]] };
}

function isExtrasEmpty(e: BorderSliceExtras | null | undefined): boolean {
  return (
    !e ||
    (e.cutsX.length === 0 &&
      e.cutsY.length === 0 &&
      e.modes.length <= 1 &&
      (e.modes[0]?.length ?? 0) <= 1)
  );
}

// Validation de forme runtime : un slice_extras DB peut venir d'une version
// antérieure du schema (ex. PR3 5-zones) ou être corrompu. On accepte
// uniquement le shape flat actuel ; tout le reste retombe en 9-slice.
function isValidExtras(e: unknown): e is BorderSliceExtras {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  if (!Array.isArray(o.cutsX) || !Array.isArray(o.cutsY) || !Array.isArray(o.modes)) {
    return false;
  }
  return true;
}

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
import { deriveDefault9Slice, SkiaBorderPreview } from './skia-border-preview';

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
  // Tout est N-slice : `slice_extras` est la source de vérité pour le grid.
  // Si la row n'en a pas, on dérive un template 9-slice classique depuis
  // slice T/R/B/L + repeat_mode (= corners fixed, edges/center repeat).
  // Le bouton "Init 9-slice" dans le panneau permet de re-dériver à tout
  // moment depuis les slice values actuelles.
  const [extras, setExtras] = useState<BorderSliceExtras>(() =>
    isValidExtras(initial?.slice_extras)
      ? initial.slice_extras
      : deriveDefault9Slice(
          initial?.image_width ?? 32,
          initial?.image_height ?? 32,
          {
            top: initial?.slice_top ?? 0,
            right: initial?.slice_right ?? 0,
            bottom: initial?.slice_bottom ?? 0,
            left: initial?.slice_left ?? 0,
          },
          initial?.repeat_mode ?? 'stretch',
        ),
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
    setExtras(
      isValidExtras(initial?.slice_extras)
        ? initial.slice_extras
        : deriveDefault9Slice(
            initial?.image_width ?? 32,
            initial?.image_height ?? 32,
            {
              top: initial?.slice_top ?? 0,
              right: initial?.slice_right ?? 0,
              bottom: initial?.slice_bottom ?? 0,
              left: initial?.slice_left ?? 0,
            },
            initial?.repeat_mode ?? 'stretch',
          ),
    );
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

    // Validation N-slice : cuts strict dans (0, imageWidth/imageHeight),
    // modes matrice (cutsY+1) × (cutsX+1) avec valeurs valides. Si la grille
    // est triviale (1×1, aucun cut), `cleaned` sera null pour économiser de
    // l'espace en DB (= équivalent au 9-slice trivial sans découpage).
    const validation = validateSliceExtras(extras, { iw, ih });
    if (validation.error) {
      setError(validation.error);
      return;
    }
    const savedExtras = validation.cleaned;

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
        slice_extras: savedExtras,
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
            // Bumpé au-dessus des CutLines (z:5) du SourceCutEditor pour
            // que les lignes draggables ne passent pas par-dessus la
            // preview au scroll.
            zIndex: 20,
            background: 'var(--paper)',
            paddingTop: 16,
            paddingBottom: 12,
            borderBottom: '1px solid var(--line)',
            marginBottom: 16,
          }}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {previewSrc ? (
              <>
                {/* Skia preview pour les deux modes (9-slice et manual) :
                    réutilise exactement le rendering de l'app mobile (math
                    + Skia draw) pour pixel-perfect parity entre BO et device.
                    Mode 9-slice : dérivé auto depuis slice T/R/B/L + repeat. */}
                <SkiaBorderPreview
                  src={previewSrc}
                  isSvg={isSvgKind}
                  imageWidth={Number.parseInt(imageWidth, 10) || 0}
                  imageHeight={Number.parseInt(imageHeight, 10) || 0}
                  sliceTop={Number.parseInt(sliceTop, 10) || 0}
                  sliceRight={Number.parseInt(sliceRight, 10) || 0}
                  sliceBottom={Number.parseInt(sliceBottom, 10) || 0}
                  sliceLeft={Number.parseInt(sliceLeft, 10) || 0}
                  bgInsetTop={resolveInset(bgInsetTop, sliceTop)}
                  bgInsetRight={resolveInset(bgInsetRight, sliceRight)}
                  bgInsetBottom={resolveInset(bgInsetBottom, sliceBottom)}
                  bgInsetLeft={resolveInset(bgInsetLeft, sliceLeft)}
                  repeatMode={repeatMode}
                  extras={extras}
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
              Vide = auto. À ajuster pour aligner le bg sur la position réelle de l&apos;encre.
            </div>

            <ManualSliceFields
              src={previewSrc}
              imageWidth={Number.parseInt(imageWidth, 10) || 0}
              imageHeight={Number.parseInt(imageHeight, 10) || 0}
              extras={extras}
              setExtras={setExtras}
              fallbackMode={repeatMode}
            />
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

// ═════════════ Helpers utilisés par save validation + éditeur ═════════════

function sortedDistinct(values: number[]): number[] {
  const set = new Set<number>();
  for (const v of values) {
    if (Number.isFinite(v)) set.add(Math.round(v));
  }
  return Array.from(set).sort((a, b) => a - b);
}

function buildBoundaries(total: number, cuts: number[]): number[] {
  const set = new Set<number>([0, total]);
  for (const c of cuts) {
    if (Number.isFinite(c)) {
      const v = Math.max(0, Math.min(total, Math.round(c)));
      set.add(v);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

// Validation N-slice avant save : cuts strict dans (0, image_w/h), modes
// matrice (cutsY+1) × (cutsX+1) avec valeurs valides. Renvoie `null` si la
// grille est triviale (1×1, équivalent au 9-slice classique) — dans ce cas
// on ne stocke pas slice_extras.
function validateSliceExtras(
  extras: BorderSliceExtras,
  dims: { iw: number; ih: number },
): { error?: string; cleaned: BorderSliceExtras | null } {
  const cutsX = sortedDistinct(extras.cutsX);
  const cutsY = sortedDistinct(extras.cutsY);
  if (cutsX.some((c) => c <= 0 || c >= dims.iw)) {
    return { error: `Coupe X hors range (entre 0 et ${dims.iw} exclus).`, cleaned: null };
  }
  if (cutsY.some((c) => c <= 0 || c >= dims.ih)) {
    return { error: `Coupe Y hors range (entre 0 et ${dims.ih} exclus).`, cleaned: null };
  }
  const expectedRows = cutsY.length + 1;
  const expectedCols = cutsX.length + 1;
  if (extras.modes.length !== expectedRows) {
    return {
      error: `Nombre de rows (${extras.modes.length}) ≠ cutsY + 1 (${expectedRows}).`,
      cleaned: null,
    };
  }
  for (let j = 0; j < extras.modes.length; j += 1) {
    if (extras.modes[j].length !== expectedCols) {
      return {
        error: `Row ${j} : ${extras.modes[j].length} cells ≠ cutsX + 1 (${expectedCols}).`,
        cleaned: null,
      };
    }
    if (!extras.modes[j].every((m) => m === 'stretch' || m === 'round' || m === 'fixed')) {
      return { error: `Row ${j} : mode invalide.`, cleaned: null };
    }
  }
  if (isExtrasEmpty({ cutsX, cutsY, modes: extras.modes })) {
    return { cleaned: null };
  }
  return {
    cleaned: { cutsX, cutsY, modes: extras.modes.map((row) => row.slice()) },
  };
}

// ═════════════ Éditeur visuel + numérique ═════════════

function ManualSliceFields({
  src,
  imageWidth,
  imageHeight,
  extras,
  setExtras,
  fallbackMode,
}: {
  src: string | null;
  imageWidth: number;
  imageHeight: number;
  extras: BorderSliceExtras;
  setExtras: Dispatch<SetStateAction<BorderSliceExtras>>;
  fallbackMode: BorderRepeatMode;
}) {
  // Init template 9-slice classique : reset extras à une grille 3×3 (= 2
  // cuts X + 2 cuts Y → 9 cells). Sans slice T/R/B/L pour driver les
  // positions, on place les cuts à 1/4 et 3/4 de l'image par default. User
  // ajuste ensuite via le drag.
  function init9Slice() {
    const sx1 = Math.round(imageWidth / 4);
    const sx2 = Math.round((imageWidth * 3) / 4);
    const sy1 = Math.round(imageHeight / 4);
    const sy2 = Math.round((imageHeight * 3) / 4);
    setExtras(
      deriveDefault9Slice(
        imageWidth,
        imageHeight,
        { top: sy1, right: imageWidth - sx2, bottom: imageHeight - sy2, left: sx1 },
        fallbackMode,
      ),
    );
  }
  function addCutX(value: number) {
    setExtras((curr) => {
      const sorted = sortedDistinct([...curr.cutsX, value]);
      const insertAt = sorted.indexOf(Math.round(value));
      const newModes = curr.modes.map((row) => {
        const out = row.slice();
        // Le band splitté à index insertAt-1 ou insertAt (selon position)
        // garde son mode à gauche, le nouveau prend fallbackMode à droite.
        // splice insère à `insertAt + 1` dans la row courante car la row a
        // length = oldCutsX.length + 1, et `insertAt` = position du nouveau
        // cut dans le nouvel array trié (le band à droite du nouveau cut
        // est à index insertAt + 1 dans la nouvelle row).
        out.splice(insertAt + 1, 0, fallbackMode);
        return out;
      });
      return { ...curr, cutsX: sorted, modes: newModes };
    });
  }
  function addCutY(value: number) {
    setExtras((curr) => {
      const sorted = sortedDistinct([...curr.cutsY, value]);
      const insertAt = sorted.indexOf(Math.round(value));
      const colCount = curr.cutsX.length + 1;
      const newRow = Array.from({ length: colCount }, () => fallbackMode as BorderBandMode);
      const newModes = curr.modes.slice();
      newModes.splice(insertAt + 1, 0, newRow);
      return { ...curr, cutsY: sorted, modes: newModes };
    });
  }
  function removeCutX(idx: number) {
    setExtras((curr) => ({
      ...curr,
      cutsX: curr.cutsX.filter((_, i) => i !== idx),
      modes: curr.modes.map((row) => row.filter((_, i) => i !== idx + 1)),
    }));
  }
  function removeCutY(idx: number) {
    setExtras((curr) => ({
      ...curr,
      cutsY: curr.cutsY.filter((_, j) => j !== idx),
      modes: curr.modes.filter((_, j) => j !== idx + 1),
    }));
  }
  function setCutX(idx: number, value: number) {
    setExtras((curr) => {
      const next = curr.cutsX.slice();
      next[idx] = value;
      return { ...curr, cutsX: next };
    });
  }
  function setCutY(idx: number, value: number) {
    setExtras((curr) => {
      const next = curr.cutsY.slice();
      next[idx] = value;
      return { ...curr, cutsY: next };
    });
  }
  function setCellMode(j: number, i: number, mode: BorderBandMode) {
    setExtras((curr) => {
      const next = curr.modes.map((r) => r.slice());
      if (next[j]) next[j][i] = mode;
      return { ...curr, modes: next };
    });
  }
  function reset() {
    setExtras(emptyExtras(fallbackMode));
  }

  const cols = extras.cutsX.length + 1;
  const rows = extras.cutsY.length + 1;

  return (
    <div
      style={{
        border: '1px dashed var(--line)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
      {/* Visual editor : drag les cuts, click sur les cells pour cycler le mode */}
      {src && imageWidth > 0 && imageHeight > 0 && (
        <SourceCutEditor
          src={src}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          extras={extras}
          setExtras={setExtras}
          fallbackMode={fallbackMode}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Grille N-slice ({rows}×{cols} cells)</strong>
        <button
          type="button"
          className="btn"
          style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }}
          onClick={init9Slice}
          title="Reset à un template 9-slice classique à partir des slice T/R/B/L courants (corners fixed, edges/center stretch)">
          Init 9-slice
        </button>
        {!isExtrasEmpty(extras) && (
          <button
            type="button"
            className="btn btn-danger"
            style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={reset}>
            Reset
          </button>
        )}
      </div>

      {/* Cuts numériques (fine-tuning) */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12 }}>Coupes X</span>
            <button
              type="button"
              className="btn"
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }}
              onClick={() => addCutX(Math.round(imageWidth / 2))}>
              + X
            </button>
          </div>
          {extras.cutsX.length === 0 && <div className="muted" style={{ fontSize: 11 }}>Aucune coupe X</div>}
          {extras.cutsX.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <input
                type="number"
                value={c}
                onChange={(e) => setCutX(i, Number.parseInt(e.target.value, 10) || 0)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '2px 8px', fontSize: 12 }}
                onClick={() => removeCutX(i)}>
                ×
              </button>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12 }}>Coupes Y</span>
            <button
              type="button"
              className="btn"
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }}
              onClick={() => addCutY(Math.round(imageHeight / 2))}>
              + Y
            </button>
          </div>
          {extras.cutsY.length === 0 && <div className="muted" style={{ fontSize: 11 }}>Aucune coupe Y</div>}
          {extras.cutsY.map((c, j) => (
            <div key={j} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <input
                type="number"
                value={c}
                onChange={(e) => setCutY(j, Number.parseInt(e.target.value, 10) || 0)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '2px 8px', fontSize: 12 }}
                onClick={() => removeCutY(j)}>
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Matrice de modes par cellule */}
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
          Modes par cellule ({rows}×{cols}) — row = ligne, col = colonne
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Array.from({ length: rows }).map((_, j) => (
            <div key={j} style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: cols }).map((_, i) => {
                const m = extras.modes[j]?.[i] ?? fallbackMode;
                return (
                  <select
                    key={i}
                    value={m}
                    onChange={(e) => setCellMode(j, i, e.target.value as BorderBandMode)}
                    style={{ flex: 1, fontSize: 11, padding: 2 }}>
                    <option value="stretch">str</option>
                    <option value="round">rnd</option>
                    <option value="fixed">fix</option>
                  </select>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════ SourceCutEditor : drag cuts + click cells pour cycler mode ═════════════

const MODE_CYCLE: Record<BorderBandMode, BorderBandMode> = {
  stretch: 'round',
  round: 'fixed',
  fixed: 'stretch',
};
const MODE_LABEL: Record<BorderBandMode, string> = {
  stretch: 'str',
  round: 'rnd',
  fixed: 'fix',
};
const MODE_COLOR: Record<BorderBandMode, string> = {
  stretch: 'rgba(120, 120, 120, 0.7)',
  round: 'rgba(46, 142, 46, 0.7)',
  fixed: 'rgba(217, 119, 6, 0.85)',
};

function SourceCutEditor({
  src,
  imageWidth,
  imageHeight,
  extras,
  setExtras,
  fallbackMode,
}: {
  src: string;
  imageWidth: number;
  imageHeight: number;
  extras: BorderSliceExtras;
  setExtras: Dispatch<SetStateAction<BorderSliceExtras>>;
  fallbackMode: BorderRepeatMode;
}) {
  const MAX_SIDE = 360;
  const naturalScale = Math.min(MAX_SIDE / imageWidth, MAX_SIDE / imageHeight);
  const scale = Math.min(naturalScale, 12);
  const W = imageWidth * scale;
  const H = imageHeight * scale;

  const canvasRef = useRef<HTMLDivElement>(null);
  type DragInfo = { axis: 'x' | 'y'; index: number };
  const [drag, setDrag] = useState<DragInfo | null>(null);

  useEffect(() => {
    if (!drag) return;
    const d = drag;
    function handleMove(ev: MouseEvent) {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (d.axis === 'x') {
        const xPx = ev.clientX - rect.left;
        const xSrc = Math.round(xPx / scale);
        const clamped = Math.max(1, Math.min(imageWidth - 1, xSrc));
        setExtras((curr) => {
          if (d.index < 0 || d.index >= curr.cutsX.length) return curr;
          const next = curr.cutsX.slice();
          next[d.index] = clamped;
          return { ...curr, cutsX: next };
        });
      } else {
        const yPx = ev.clientY - rect.top;
        const ySrc = Math.round(yPx / scale);
        const clamped = Math.max(1, Math.min(imageHeight - 1, ySrc));
        setExtras((curr) => {
          if (d.index < 0 || d.index >= curr.cutsY.length) return curr;
          const next = curr.cutsY.slice();
          next[d.index] = clamped;
          return { ...curr, cutsY: next };
        });
      }
    }
    function handleUp() {
      setDrag(null);
    }
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = prevUserSelect;
    };
  }, [drag, scale, imageWidth, imageHeight, setExtras]);

  function addCutAtPoint(clientX: number, clientY: number) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    // Décide axe : si plus proche d'un edge horizontal (top/bottom du canvas),
    // on ajoute un cut Y. Sinon X. Heuristique simple, suffisante pour
    // l'usage typique.
    const distToTopBot = Math.min(localY, H - localY);
    const distToLeftRight = Math.min(localX, W - localX);
    if (distToLeftRight < distToTopBot) {
      // Plus proche d'un edge vertical → cut X
      const xSrc = Math.round(localX / scale);
      const clamped = Math.max(1, Math.min(imageWidth - 1, xSrc));
      setExtras((curr) => {
        const sorted = sortedDistinct([...curr.cutsX, clamped]);
        const insertAt = sorted.indexOf(clamped);
        const newModes = curr.modes.map((row) => {
          const out = row.slice();
          out.splice(insertAt + 1, 0, fallbackMode);
          return out;
        });
        return { ...curr, cutsX: sorted, modes: newModes };
      });
    } else {
      const ySrc = Math.round(localY / scale);
      const clamped = Math.max(1, Math.min(imageHeight - 1, ySrc));
      setExtras((curr) => {
        const sorted = sortedDistinct([...curr.cutsY, clamped]);
        const insertAt = sorted.indexOf(clamped);
        const colCount = curr.cutsX.length + 1;
        const newRow = Array.from({ length: colCount }, () => fallbackMode as BorderBandMode);
        const newModes = curr.modes.slice();
        newModes.splice(insertAt + 1, 0, newRow);
        return { ...curr, cutsY: sorted, modes: newModes };
      });
    }
  }

  function removeCut(axis: 'x' | 'y', idx: number) {
    if (axis === 'x') {
      setExtras((curr) => ({
        ...curr,
        cutsX: curr.cutsX.filter((_, i) => i !== idx),
        modes: curr.modes.map((row) => row.filter((_, i) => i !== idx + 1)),
      }));
    } else {
      setExtras((curr) => ({
        ...curr,
        cutsY: curr.cutsY.filter((_, j) => j !== idx),
        modes: curr.modes.filter((_, j) => j !== idx + 1),
      }));
    }
  }

  function cycleCellMode(j: number, i: number) {
    setExtras((curr) => {
      const next = curr.modes.map((r) => r.slice());
      if (!next[j]) return curr;
      const cur = next[j][i] ?? fallbackMode;
      next[j][i] = MODE_CYCLE[cur];
      return { ...curr, modes: next };
    });
  }

  // Boundaries pour positionner les cells de la grille visuelle.
  const xs = buildBoundaries(imageWidth, extras.cutsX);
  const ys = buildBoundaries(imageHeight, extras.cutsY);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div className="muted" style={{ fontSize: 11 }}>
        Source {imageWidth}×{imageHeight} · scale ×{scale.toFixed(2)} · click pour ajouter une coupe · drag pour déplacer · click sur cell pour cycler le mode
      </div>
      <div
        ref={canvasRef}
        onClick={(e) => {
          if (drag !== null) return;
          // Click hors d'une cell button ou d'une ligne → add cut.
          // Si la cible est un button (cell mode) ou une ligne, stopPropagation
          // les empêche d'arriver ici.
          addCutAtPoint(e.clientX, e.clientY);
        }}
        style={{
          position: 'relative',
          width: W,
          height: H,
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          cursor: 'crosshair',
        }}>
        <img
          src={src}
          alt="source"
          draggable={false}
          style={{
            width: W,
            height: H,
            display: 'block',
            imageRendering: 'pixelated',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
        {/* Cell buttons : un overlay par cell pour cycler le mode au click. Sized
            sur la grille source-pixel du canvas (scale appliqué). Le hover
            highlights le mode courant. */}
        {ys.slice(0, -1).map((_, j) => {
          const sh = ys[j + 1] - ys[j];
          if (sh <= 0) return null;
          return xs.slice(0, -1).map((_, i) => {
            const sw = xs[i + 1] - xs[i];
            if (sw <= 0) return null;
            const m = extras.modes[j]?.[i] ?? fallbackMode;
            return (
              <CellModeOverlay
                key={`cell-${j}-${i}`}
                left={xs[i] * scale}
                top={ys[j] * scale}
                width={sw * scale}
                height={sh * scale}
                mode={m}
                onCycle={() => cycleCellMode(j, i)}
              />
            );
          });
        })}
        {/* Lignes draggables : X cuts (verticales) puis Y cuts (horizontales) */}
        {extras.cutsX.map((c, i) => (
          <CutLine
            key={`x-${i}`}
            axis="x"
            posPx={c * scale}
            length={H}
            dragging={drag?.axis === 'x' && drag.index === i}
            onDragStart={() => setDrag({ axis: 'x', index: i })}
            onRemove={() => removeCut('x', i)}
            valueLabel={String(c)}
          />
        ))}
        {extras.cutsY.map((c, j) => (
          <CutLine
            key={`y-${j}`}
            axis="y"
            posPx={c * scale}
            length={W}
            dragging={drag?.axis === 'y' && drag.index === j}
            onDragStart={() => setDrag({ axis: 'y', index: j })}
            onRemove={() => removeCut('y', j)}
            valueLabel={String(c)}
          />
        ))}
      </div>
    </div>
  );
}

function CellModeOverlay({
  left,
  top,
  width,
  height,
  mode,
  onCycle,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  mode: BorderBandMode;
  onCycle: () => void;
}) {
  if (width <= 0 || height <= 0) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onCycle();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title={`Mode ${mode} — click pour changer`}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        background: 'transparent',
        border: '1px dotted rgba(0,0,0,0.15)',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <span
        style={{
          background: MODE_COLOR[mode],
          color: 'white',
          fontSize: 10,
          fontWeight: 600,
          padding: '1px 4px',
          borderRadius: 3,
          pointerEvents: 'none',
        }}>
        {MODE_LABEL[mode]}
      </span>
    </button>
  );
}

function CutLine({
  axis,
  posPx,
  length,
  dragging,
  onDragStart,
  onRemove,
  valueLabel,
}: {
  axis: 'x' | 'y';
  posPx: number;
  length: number;
  dragging: boolean;
  onDragStart: () => void;
  onRemove: () => void;
  valueLabel: string;
}) {
  const HIT = 10;
  const color = dragging ? '#1a73e8' : '#3a86ff';
  const lineWidth = dragging ? 2 : 1;

  if (axis === 'x') {
    return (
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragStart();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: posPx - HIT / 2,
          top: 0,
          width: HIT,
          height: length,
          cursor: 'ew-resize',
          zIndex: 5,
        }}>
        <div
          style={{
            position: 'absolute',
            left: HIT / 2 - lineWidth / 2,
            top: 0,
            width: lineWidth,
            height: length,
            background: color,
            boxShadow: dragging ? `0 0 0 1px ${color}` : 'none',
            pointerEvents: 'none',
          }}
        />
        {dragging && (
          <div
            style={{
              position: 'absolute',
              left: HIT / 2 + 4,
              top: 4,
              padding: '1px 4px',
              fontSize: 10,
              background: color,
              color: 'white',
              borderRadius: 3,
              pointerEvents: 'none',
            }}>
            {valueLabel}
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Supprimer cette coupe"
          style={{
            position: 'absolute',
            left: HIT / 2 - 7,
            bottom: -8,
            width: 16,
            height: 16,
            padding: 0,
            background: color,
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 10,
            lineHeight: '16px',
            zIndex: 6,
          }}>
          ×
        </button>
      </div>
    );
  }
  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragStart();
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: posPx - HIT / 2,
        left: 0,
        height: HIT,
        width: length,
        cursor: 'ns-resize',
        zIndex: 5,
      }}>
      <div
        style={{
          position: 'absolute',
          top: HIT / 2 - lineWidth / 2,
          left: 0,
          height: lineWidth,
          width: length,
          background: color,
          boxShadow: dragging ? `0 0 0 1px ${color}` : 'none',
          pointerEvents: 'none',
        }}
      />
      {dragging && (
        <div
          style={{
            position: 'absolute',
            top: HIT / 2 + 4,
            left: 4,
            padding: '1px 4px',
            fontSize: 10,
            background: color,
            color: 'white',
            borderRadius: 3,
            pointerEvents: 'none',
          }}>
          {valueLabel}
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemove();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Supprimer cette coupe"
        style={{
          position: 'absolute',
          top: HIT / 2 - 7,
          right: -8,
          width: 16,
          height: 16,
          padding: 0,
          background: color,
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 10,
          lineHeight: '16px',
          zIndex: 6,
        }}>
        ×
      </button>
    </div>
  );
}

