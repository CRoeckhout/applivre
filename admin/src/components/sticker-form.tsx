import { useEffect, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import type { CatalogAvailability, StickerCatalogRow, StickerKind } from '../lib/types';
import {
  AvailabilityFieldset,
  KindFileFieldset,
  PeriodFieldset,
  SizeSlider,
  TokensField,
  applySvgPreviewOverrides,
  type DecorationKind,
} from './decoration-fields';

type Props = {
  initial: StickerCatalogRow | null;
  onSaved: (saved: StickerCatalogRow) => void;
  onDeleted: (key: string) => void;
};

// Mapping entre le kind interne du sticker (`png` / `svg`) et le `DecorationKind`
// du composant générique (`png_9slice` / `svg_9slice`). Le suffixe `_9slice`
// est un legacy de naming partagé avec cadres/fonds — pour les stickers, slice
// n'a aucun sens, mais le composant `KindFileFieldset` n'a pas besoin de le
// savoir. On translate aux limites (load + save) pour ne pas dupliquer le
// fieldset.
function toDecorationKind(k: StickerKind): DecorationKind {
  return k === 'svg' ? 'svg_9slice' : 'png_9slice';
}
function fromDecorationKind(k: DecorationKind): StickerKind {
  return k === 'svg_9slice' ? 'svg' : 'png';
}

export function StickerForm({ initial, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  const [stickerKey, setStickerKey] = useState(initial?.sticker_key ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [kind, setKind] = useState<DecorationKind>(
    initial ? toDecorationKind(initial.kind) : 'png_9slice',
  );
  const [imageWidth, setImageWidth] = useState<string>(
    initial ? String(initial.image_width) : '128',
  );
  const [imageHeight, setImageHeight] = useState<string>(
    initial ? String(initial.image_height) : '128',
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

  const [previewW, setPreviewW] = useState(160);
  const [previewH, setPreviewH] = useState(160);
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    setStickerKey(initial?.sticker_key ?? '');
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setKind(initial ? toDecorationKind(initial.kind) : 'png_9slice');
    setImageWidth(initial ? String(initial.image_width) : '128');
    setImageHeight(initial ? String(initial.image_height) : '128');
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
    const path = `${stickerKey}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('sticker-graphics')
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

    if (!stickerKey || !title) {
      setError('sticker_key et titre requis');
      return;
    }
    if (tokensError) {
      setError(`Tokens : ${tokensError}`);
      return;
    }

    const iw = Number.parseInt(imageWidth, 10);
    const ih = Number.parseInt(imageHeight, 10);
    if (![iw, ih].every((n) => Number.isFinite(n) && n > 0)) {
      setError('Dimensions doivent être des entiers > 0');
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
        sticker_key: stickerKey,
        title,
        description: description || null,
        kind: fromDecorationKind(kind),
        storage_path: finalPath,
        payload: finalPayload,
        image_width: iw,
        image_height: ih,
        tokens: parsedTokens,
        availability,
        unlock_badge_key: initial?.unlock_badge_key ?? null,
        active_from: activeFrom ? new Date(activeFrom).toISOString() : null,
        active_until: activeUntil ? new Date(activeUntil).toISOString() : null,
        retired_at: retiredAt ? new Date(retiredAt).toISOString() : null,
      };
      const { data, error: upErr } = await supabase
        .from('sticker_catalog')
        .upsert(row, { onConflict: 'sticker_key' })
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
      onSaved(data as StickerCatalogRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  async function retire() {
    if (!initial) return;
    if (!confirm(`Retirer le sticker "${initial.title}" ?`)) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('sticker_catalog')
      .update({ retired_at: new Date().toISOString() })
      .eq('sticker_key', initial.sticker_key);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted(initial.sticker_key);
  }

  async function unretire() {
    if (!initial) return;
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('sticker_catalog')
      .update({ retired_at: null })
      .eq('sticker_key', initial.sticker_key)
      .select()
      .single();
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(data as StickerCatalogRow);
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
        ? `${SUPABASE_URL}/storage/v1/object/public/sticker-graphics/${storagePath}`
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
                {/* Preview du sticker à taille libre — l'app utilisera la
                    même source posée à un (x,y,scale,rotation) arbitraire,
                    mais ici on montre le rendu net avec contentFit:contain. */}
                <div
                  style={{
                    width: previewW,
                    height: previewH,
                    border: '1px dashed rgba(107,98,89,0.4)',
                    borderRadius: 8,
                    background: '#f4efe6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                  <img
                    src={previewSrc}
                    alt=""
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                  />
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SizeSlider label="W" value={previewW} min={60} max={400} onChange={setPreviewW} />
                  <SizeSlider label="H" value={previewH} min={60} max={400} onChange={setPreviewH} />
                </div>
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12, padding: 24 }}>Sélectionne un fichier.</div>
            )}
          </div>
        </div>

        <div>
          <h2 style={{ marginTop: 0 }}>{isNew ? 'Nouveau sticker' : stickerKey}</h2>

          <div className="field">
            <label>sticker_key</label>
            <input
              value={stickerKey}
              onChange={(e) => setStickerKey(e.target.value)}
              disabled={!isNew}
              placeholder="ex: heart_v1"
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
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Les dimensions servent uniquement à fixer l&apos;aspect ratio du
              sticker — la taille rendue dans l&apos;app dépend de la largeur de
              la fiche et du multiplicateur `scale` choisi par l&apos;utilisateur.
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
            helper="Disponible pour tous : utilisable sans condition. Premium : visible avec étoile, paywall au clic si non-premium. Obtention d'un badge : caché tant que le badge n'est pas obtenu (unlock via user_stickers). À l'unité : à venir."
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
