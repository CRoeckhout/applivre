import { useEffect, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import type {
  BorderBandMode,
  BorderCatalogRow,
  BorderRepeatMode,
  CatalogAvailability,
} from '../lib/types';
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
  // Mode N-slice : `9slice` = comportement actuel (slice outer + repeat global) ;
  // `manual` = on expose extra_cuts_x/y et band_modes_x/y. Le sliceMode est
  // dérivé au load : si une row a des extra_cuts non vides ⇒ manual.
  const initialIsManual =
    (initial?.extra_cuts_x?.length ?? 0) > 0 ||
    (initial?.extra_cuts_y?.length ?? 0) > 0;
  const [sliceMode, setSliceMode] = useState<'9slice' | 'manual'>(
    initialIsManual ? 'manual' : '9slice',
  );
  const [extraCutsX, setExtraCutsX] = useState<number[]>(
    initial?.extra_cuts_x ?? [],
  );
  const [extraCutsY, setExtraCutsY] = useState<number[]>(
    initial?.extra_cuts_y ?? [],
  );
  // length toujours = extraCuts.length + 1. Init avec un seul band en repeat
  // global (= comportement 9-slice traduit en N-slice trivial).
  const [bandModesX, setBandModesX] = useState<BorderBandMode[]>(
    initial?.band_modes_x ?? [initial?.repeat_mode ?? 'stretch'],
  );
  const [bandModesY, setBandModesY] = useState<BorderBandMode[]>(
    initial?.band_modes_y ?? [initial?.repeat_mode ?? 'stretch'],
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
    const initialManual =
      (initial?.extra_cuts_x?.length ?? 0) > 0 ||
      (initial?.extra_cuts_y?.length ?? 0) > 0;
    setSliceMode(initialManual ? 'manual' : '9slice');
    setExtraCutsX(initial?.extra_cuts_x ?? []);
    setExtraCutsY(initial?.extra_cuts_y ?? []);
    setBandModesX(initial?.band_modes_x ?? [initial?.repeat_mode ?? 'stretch']);
    setBandModesY(initial?.band_modes_y ?? [initial?.repeat_mode ?? 'stretch']);
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

    // Validation N-slice manual : cuts strictement entre les outer slices,
    // sans doublon, et bandModes cohérents (length = cuts + 1, valeurs valides).
    let savedCutsX: number[] | null = null;
    let savedCutsY: number[] | null = null;
    let savedModesX: BorderBandMode[] | null = null;
    let savedModesY: BorderBandMode[] | null = null;
    if (sliceMode === 'manual') {
      const sortedX = sortedDistinct(extraCutsX);
      const sortedY = sortedDistinct(extraCutsY);
      const xLowerBound = sl;
      const xUpperBound = iw - sr;
      const yLowerBound = st;
      const yUpperBound = ih - sb;
      if (sortedX.some((c) => c <= xLowerBound || c >= xUpperBound)) {
        setError(`Coupes X hors range (doit être strictement entre ${xLowerBound} et ${xUpperBound}).`);
        return;
      }
      if (sortedY.some((c) => c <= yLowerBound || c >= yUpperBound)) {
        setError(`Coupes Y hors range (doit être strictement entre ${yLowerBound} et ${yUpperBound}).`);
        return;
      }
      if (bandModesX.length !== sortedX.length + 1 || bandModesY.length !== sortedY.length + 1) {
        setError('Incohérence interne : nombre de modes ≠ coupes + 1.');
        return;
      }
      // Empty cuts en mode manual = single band sur l'axe : on stocke quand
      // même les modes pour matérialiser le choix utilisateur (sinon rowToDef
      // retombe sur le repeat global, ce qui est fonctionnellement équivalent
      // mais perd l'info que l'admin a explicitement choisi le mode).
      savedCutsX = sortedX;
      savedCutsY = sortedY;
      savedModesX = bandModesX;
      savedModesY = bandModesY;
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
        extra_cuts_x: savedCutsX,
        extra_cuts_y: savedCutsY,
        band_modes_x: savedModesX,
        band_modes_y: savedModesY,
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
                {sliceMode === 'manual' ? (
                  <PreviewFrameNSlice
                    src={previewSrc}
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
                    extraCutsX={extraCutsX}
                    extraCutsY={extraCutsY}
                    bandModesX={bandModesX}
                    bandModesY={bandModesY}
                    outerWidth={previewW}
                    outerHeight={previewH}
                  />
                ) : (
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
                )}
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
                En mode N-slice manuel, ce champ sert de fallback pour les bandes sans
                mode explicite.
              </div>
            </div>

            <div className="field">
              <label>Slice</label>
              <select
                value={sliceMode}
                onChange={(e) => {
                  const next = e.target.value as '9slice' | 'manual';
                  setSliceMode(next);
                  if (next === 'manual') {
                    // Init le mode unique de chaque axe avec le repeat global
                    // si on n'avait rien (sinon on garde l'existant).
                    if (bandModesX.length === 0) setBandModesX([repeatMode]);
                    if (bandModesY.length === 0) setBandModesY([repeatMode]);
                  }
                }}>
                <option value="9slice">9-slice (default)</option>
                <option value="manual">Manuel — N-slice</option>
              </select>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Mode 9-slice : 4 coins + 4 edges + 1 centre (repeat global). Mode
                manuel : ajoute des coupes supplémentaires pour ancrer un ornement
                au milieu d&apos;un edge (mode `fixed`) ou pour faire varier le
                comportement par segment.
              </div>
            </div>

            {sliceMode === 'manual' && (
              <ManualSliceFields
                imageWidth={Number.parseInt(imageWidth, 10) || 0}
                imageHeight={Number.parseInt(imageHeight, 10) || 0}
                sliceTop={Number.parseInt(sliceTop, 10) || 0}
                sliceRight={Number.parseInt(sliceRight, 10) || 0}
                sliceBottom={Number.parseInt(sliceBottom, 10) || 0}
                sliceLeft={Number.parseInt(sliceLeft, 10) || 0}
                extraCutsX={extraCutsX}
                setExtraCutsX={setExtraCutsX}
                extraCutsY={extraCutsY}
                setExtraCutsY={setExtraCutsY}
                bandModesX={bandModesX}
                setBandModesX={setBandModesX}
                bandModesY={bandModesY}
                setBandModesY={setBandModesY}
                fallbackMode={repeatMode}
              />
            )}
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

// Helpers N-slice partagés entre la preview JS et la validation save.
type Band = { start: number; end: number; mode: BorderBandMode };

function sortedDistinct(values: number[]): number[] {
  const set = new Set<number>();
  for (const v of values) {
    if (Number.isFinite(v) && v >= 0) set.add(Math.round(v));
  }
  return Array.from(set).sort((a, b) => a - b);
}

// Construit la liste de bands sur un axe : 1 corner-fixed start + (N+1) bands
// middle (mode = bandModes[i] ou fallback) + 1 corner-fixed end. Mirror
// exact de la fonction du même nom dans components/nine-slice-frame.tsx —
// duplication acceptée car la preview admin doit rester autonome (pas de
// dépendance React Native depuis le BO web).
function buildBands(
  outerStart: number,
  outerEnd: number,
  total: number,
  cuts: number[] | undefined,
  modes: BorderBandMode[] | undefined,
  fallback: BorderBandMode,
): Band[] {
  const sortedCuts = (cuts ?? [])
    .filter((c) => c > outerStart && c < outerEnd)
    .slice()
    .sort((a, b) => a - b);
  const bands: Band[] = [];
  bands.push({ start: 0, end: outerStart, mode: 'fixed' });
  const xs = [outerStart, ...sortedCuts, outerEnd];
  for (let i = 0; i < xs.length - 1; i += 1) {
    bands.push({ start: xs[i], end: xs[i + 1], mode: modes?.[i] ?? fallback });
  }
  bands.push({ start: outerEnd, end: total, mode: 'fixed' });
  return bands;
}

// Distribue `totalSize` sur les bandes : `fixed` prend sa taille source en
// pixels ; `stretch`/`round` partagent le reste proportionnellement à leur
// taille source. Si la somme des fixed dépasse total, les flex tombent à 0
// et les fixed gardent leur taille (overflow visuel — l'admin gère).
function computeAxisLayout(bands: Band[], totalSize: number): number[] {
  let fixedTotal = 0;
  let flexSourceTotal = 0;
  for (const b of bands) {
    const sz = b.end - b.start;
    if (b.mode === 'fixed') fixedTotal += sz;
    else flexSourceTotal += sz;
  }
  const remaining = Math.max(0, totalSize - fixedTotal);
  return bands.map((b) => {
    const sz = b.end - b.start;
    if (b.mode === 'fixed') return sz;
    return flexSourceTotal > 0 ? (sz / flexSourceTotal) * remaining : 0;
  });
}

// Cumule les sizes pour obtenir les positions absolues de début de chaque
// band. pos[i] = somme(sizes[0..i-1]).
function computeCumulative(sizes: number[]): number[] {
  const pos: number[] = [];
  let acc = 0;
  for (const s of sizes) {
    pos.push(acc);
    acc += s;
  }
  return pos;
}

// Preview JS pour le mode N-slice : reproduit la math de `NineSliceFrame`
// avec des <div> + <img> en absolu. CSS `border-image` ne supporte pas le
// N-slice (limité à 9), donc on rend nous-mêmes la grille.
function PreviewFrameNSlice({
  src,
  imageWidth,
  imageHeight,
  sliceTop,
  sliceRight,
  sliceBottom,
  sliceLeft,
  bgInsetTop,
  bgInsetRight,
  bgInsetBottom,
  bgInsetLeft,
  repeatMode,
  extraCutsX,
  extraCutsY,
  bandModesX,
  bandModesY,
  outerWidth,
  outerHeight,
}: {
  src: string;
  imageWidth: number;
  imageHeight: number;
  sliceTop: number;
  sliceRight: number;
  sliceBottom: number;
  sliceLeft: number;
  bgInsetTop: number;
  bgInsetRight: number;
  bgInsetBottom: number;
  bgInsetLeft: number;
  repeatMode: BorderRepeatMode;
  extraCutsX: number[];
  extraCutsY: number[];
  bandModesX: BorderBandMode[];
  bandModesY: BorderBandMode[];
  outerWidth: number;
  outerHeight: number;
}) {
  const xBands = buildBands(
    sliceLeft,
    imageWidth - sliceRight,
    imageWidth,
    extraCutsX,
    bandModesX,
    repeatMode,
  );
  const yBands = buildBands(
    sliceTop,
    imageHeight - sliceBottom,
    imageHeight,
    extraCutsY,
    bandModesY,
    repeatMode,
  );
  const xSizes = computeAxisLayout(xBands, outerWidth);
  const ySizes = computeAxisLayout(yBands, outerHeight);
  const xPos = computeCumulative(xSizes);
  const yPos = computeCumulative(ySizes);

  const cells: React.ReactNode[] = [];
  for (let j = 0; j < yBands.length; j += 1) {
    for (let i = 0; i < xBands.length; i += 1) {
      const xb = xBands[i];
      const yb = yBands[j];
      const cellW = xSizes[i];
      const cellH = ySizes[j];
      if (cellW <= 0 || cellH <= 0) continue;
      cells.push(
        <NSliceCell
          key={`${j}-${i}`}
          src={src}
          iw={imageWidth}
          ih={imageHeight}
          sx={xb.start}
          sy={yb.start}
          sw={xb.end - xb.start}
          sh={yb.end - yb.start}
          xMode={xb.mode}
          yMode={yb.mode}
          left={xPos[i]}
          top={yPos[j]}
          width={cellW}
          height={cellH}
        />,
      );
    }
  }

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
      {cells}
    </div>
  );
}

// Cell preview : portion (sx,sy,sw,sh) de la source rendue à (left,top,
// width,height). Selon (xMode,yMode) : `round` tile ; `stretch`/`fixed`
// rendent la portion une fois (le sizing pixel/flex est appliqué par le
// parent via xSizes/ySizes — `fixed` reçoit déjà sw px en width).
function NSliceCell({
  src,
  iw,
  ih,
  sx,
  sy,
  sw,
  sh,
  xMode,
  yMode,
  left,
  top,
  width,
  height,
}: {
  src: string;
  iw: number;
  ih: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  xMode: BorderBandMode;
  yMode: BorderBandMode;
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const tileX = xMode === 'round';
  const tileY = yMode === 'round';

  if (!tileX && !tileY) {
    const scaleX = sw > 0 ? width / sw : 0;
    const scaleY = sh > 0 ? height / sh : 0;
    return (
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          overflow: 'hidden',
        }}>
        <img
          src={src}
          alt=""
          style={{
            position: 'absolute',
            left: -sx * scaleX,
            top: -sy * scaleY,
            width: scaleX * iw,
            height: scaleY * ih,
            imageRendering: 'pixelated',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  // Tiling. Mêmes règles que NineSliceFrame côté app : count entier scalé
  // pour rentrer pile + overlap +1px sur l'axe tilé pour masquer les seams.
  const OVERLAP = 1;
  const nx = tileX && sw > 0 ? Math.max(1, Math.round(width / sw)) : 1;
  const ny = tileY && sh > 0 ? Math.max(1, Math.round(height / sh)) : 1;
  const tileW = width / nx;
  const tileH = height / ny;

  const tiles: React.ReactNode[] = [];
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const tw = tileW + (tileX ? OVERLAP : 0);
      const th = tileH + (tileY ? OVERLAP : 0);
      const sX = sw > 0 ? tw / sw : 0;
      const sY = sh > 0 ? th / sh : 0;
      tiles.push(
        <div
          key={`${j}-${i}`}
          style={{
            position: 'absolute',
            left: i * tileW,
            top: j * tileH,
            width: tw,
            height: th,
            overflow: 'hidden',
          }}>
          <img
            src={src}
            alt=""
            style={{
              position: 'absolute',
              left: -sx * sX,
              top: -sy * sY,
              width: sX * iw,
              height: sY * ih,
              imageRendering: 'pixelated',
              pointerEvents: 'none',
            }}
          />
        </div>,
      );
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        overflow: 'hidden',
      }}>
      {tiles}
    </div>
  );
}

// Fields N-slice manuel : pour chaque axe, liste de cuts (positions en px
// dans l'image source) + select de mode par bande. Add/remove ajustent la
// longueur de bandModes pour rester cohérents (length = cuts + 1).
function ManualSliceFields({
  imageWidth,
  imageHeight,
  sliceTop,
  sliceRight,
  sliceBottom,
  sliceLeft,
  extraCutsX,
  setExtraCutsX,
  extraCutsY,
  setExtraCutsY,
  bandModesX,
  setBandModesX,
  bandModesY,
  setBandModesY,
  fallbackMode,
}: {
  imageWidth: number;
  imageHeight: number;
  sliceTop: number;
  sliceRight: number;
  sliceBottom: number;
  sliceLeft: number;
  extraCutsX: number[];
  setExtraCutsX: (v: number[]) => void;
  extraCutsY: number[];
  setExtraCutsY: (v: number[]) => void;
  bandModesX: BorderBandMode[];
  setBandModesX: (v: BorderBandMode[]) => void;
  bandModesY: BorderBandMode[];
  setBandModesY: (v: BorderBandMode[]) => void;
  fallbackMode: BorderRepeatMode;
}) {
  const xMin = sliceLeft;
  const xMax = imageWidth - sliceRight;
  const yMin = sliceTop;
  const yMax = imageHeight - sliceBottom;

  function addCut(
    axis: 'x' | 'y',
  ) {
    const cuts = axis === 'x' ? extraCutsX : extraCutsY;
    const modes = axis === 'x' ? bandModesX : bandModesY;
    const setCuts = axis === 'x' ? setExtraCutsX : setExtraCutsY;
    const setModes = axis === 'x' ? setBandModesX : setBandModesY;
    const min = axis === 'x' ? xMin : yMin;
    const max = axis === 'x' ? xMax : yMax;
    // Trouver la plus grande bande middle et insérer un cut à son milieu.
    // bandModes a length = cuts + 1, donc on parcourt les bandes en lockstep.
    const sorted = sortedDistinct(cuts);
    const xs = [min, ...sorted, max];
    let bestIdx = 0;
    let bestSize = -1;
    for (let i = 0; i < xs.length - 1; i += 1) {
      const sz = xs[i + 1] - xs[i];
      if (sz > bestSize) {
        bestSize = sz;
        bestIdx = i;
      }
    }
    if (bestSize < 2) return;
    const mid = Math.round((xs[bestIdx] + xs[bestIdx + 1]) / 2);
    const newCuts = sortedDistinct([...sorted, mid]);
    // Insère un nouveau band mode à la position du cut. Comme on splitte la
    // band bestIdx en deux, le nouveau mode va à bestIdx+1 (la sous-band
    // droite hérite de fallback ; la gauche garde le mode existant).
    const newModes: BorderBandMode[] = [
      ...modes.slice(0, bestIdx + 1),
      fallbackMode,
      ...modes.slice(bestIdx + 1),
    ];
    setCuts(newCuts);
    setModes(newModes);
  }

  function removeCut(axis: 'x' | 'y', cutIndex: number) {
    const cuts = axis === 'x' ? extraCutsX : extraCutsY;
    const modes = axis === 'x' ? bandModesX : bandModesY;
    const setCuts = axis === 'x' ? setExtraCutsX : setExtraCutsY;
    const setModes = axis === 'x' ? setBandModesX : setBandModesY;
    if (cutIndex < 0 || cutIndex >= cuts.length) return;
    const newCuts = cuts.filter((_, i) => i !== cutIndex);
    // Retirer le cut à index cutIndex fusionne les bands cutIndex et
    // cutIndex+1. On garde le mode de la band gauche (cutIndex), on drop
    // celui de la band droite (cutIndex+1).
    const newModes = modes.filter((_, i) => i !== cutIndex + 1);
    setCuts(newCuts);
    setModes(newModes);
  }

  function updateCut(axis: 'x' | 'y', cutIndex: number, value: number) {
    const cuts = axis === 'x' ? extraCutsX : extraCutsY;
    const setCuts = axis === 'x' ? setExtraCutsX : setExtraCutsY;
    const next = cuts.slice();
    next[cutIndex] = value;
    setCuts(next);
  }

  function updateMode(axis: 'x' | 'y', bandIndex: number, mode: BorderBandMode) {
    const modes = axis === 'x' ? bandModesX : bandModesY;
    const setModes = axis === 'x' ? setBandModesX : setBandModesY;
    if (bandIndex < 0 || bandIndex >= modes.length) return;
    const next = modes.slice();
    next[bandIndex] = mode;
    setModes(next);
  }

  return (
    <div
      style={{
        border: '1px dashed var(--line)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
      <AxisSection
        axis="x"
        title="Axe X (cuts horizontaux)"
        rangeLabel={`${xMin} ↔ ${xMax}`}
        cuts={extraCutsX}
        modes={bandModesX}
        onAdd={() => addCut('x')}
        onRemove={(i) => removeCut('x', i)}
        onUpdateCut={(i, v) => updateCut('x', i, v)}
        onUpdateMode={(i, m) => updateMode('x', i, m)}
      />
      <AxisSection
        axis="y"
        title="Axe Y (cuts verticaux)"
        rangeLabel={`${yMin} ↔ ${yMax}`}
        cuts={extraCutsY}
        modes={bandModesY}
        onAdd={() => addCut('y')}
        onRemove={(i) => removeCut('y', i)}
        onUpdateCut={(i, v) => updateCut('y', i, v)}
        onUpdateMode={(i, m) => updateMode('y', i, m)}
      />
    </div>
  );
}

function AxisSection({
  title,
  rangeLabel,
  cuts,
  modes,
  onAdd,
  onRemove,
  onUpdateCut,
  onUpdateMode,
}: {
  axis: 'x' | 'y';
  title: string;
  rangeLabel: string;
  cuts: number[];
  modes: BorderBandMode[];
  onAdd: () => void;
  onRemove: (cutIndex: number) => void;
  onUpdateCut: (cutIndex: number, value: number) => void;
  onUpdateMode: (bandIndex: number, mode: BorderBandMode) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>{title}</strong>
        <span className="muted" style={{ fontSize: 11 }}>{rangeLabel}</span>
        <button type="button" className="btn" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }} onClick={onAdd}>
          + Ajouter une coupe
        </button>
      </div>
      {cuts.length === 0 && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          Aucune coupe — la bande middle entière utilise le mode ci-dessous.
        </div>
      )}
      {/* Liste des cuts (positions). Les bands sont entrelacées : band 0 est
          avant le cut 0, band i est entre cut i-1 et cut i, dernier band
          après le dernier cut. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <BandModeRow
          label={cuts.length === 0 ? 'Bande middle' : `Bande 0 (avant la 1ʳᵉ coupe)`}
          mode={modes[0] ?? 'stretch'}
          onChange={(m) => onUpdateMode(0, m)}
        />
        {cuts.map((cutValue, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, minWidth: 60 }}>Coupe {i + 1}</span>
              <input
                type="number"
                value={cutValue}
                onChange={(e) => onUpdateCut(i, Number.parseInt(e.target.value, 10) || 0)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '2px 8px', fontSize: 12 }}
                onClick={() => onRemove(i)}>
                ×
              </button>
            </div>
            <BandModeRow
              label={`Bande ${i + 1} (après coupe ${i + 1})`}
              mode={modes[i + 1] ?? 'stretch'}
              onChange={(m) => onUpdateMode(i + 1, m)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BandModeRow({
  label,
  mode,
  onChange,
}: {
  label: string;
  mode: BorderBandMode;
  onChange: (m: BorderBandMode) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 12 }}>
      <span className="muted" style={{ fontSize: 11, minWidth: 180 }}>{label}</span>
      <select value={mode} onChange={(e) => onChange(e.target.value as BorderBandMode)} style={{ flex: 1 }}>
        <option value="stretch">stretch — étire</option>
        <option value="round">round — tile</option>
        <option value="fixed">fixed — taille source (ornement ancré)</option>
      </select>
    </div>
  );
}
