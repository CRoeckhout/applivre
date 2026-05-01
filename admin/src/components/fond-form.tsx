import { useEffect, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import type { FondCatalogRow, FondRepeatMode } from '../lib/types';
import {
  KindFileFieldset,
  PeriodFieldset,
  SizeSlider,
  TokensField,
  VisibilityFieldset,
  applySvgPreviewOverrides,
  type DecorationKind,
} from './decoration-fields';

type Props = {
  initial: FondCatalogRow | null;
  onSaved: (saved: FondCatalogRow) => void;
  onDeleted: (key: string) => void;
};

export function FondForm({ initial, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  const [fondKey, setFondKey] = useState(initial?.fond_key ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [kind, setKind] = useState<DecorationKind>(initial?.kind ?? 'png_9slice');
  const [imageWidth, setImageWidth] = useState<string>(
    initial ? String(initial.image_width) : '128',
  );
  const [imageHeight, setImageHeight] = useState<string>(
    initial ? String(initial.image_height) : '128',
  );
  const [repeatMode, setRepeatMode] = useState<FondRepeatMode>(
    initial?.repeat_mode ?? 'cover',
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
  const [payloadText, setPayloadText] = useState<string | null>(initial?.payload ?? null);
  const [pendingPayloadText, setPendingPayloadText] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [previewW, setPreviewW] = useState(240);
  const [previewH, setPreviewH] = useState(140);
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    setFondKey(initial?.fond_key ?? '');
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setKind(initial?.kind ?? 'png_9slice');
    setImageWidth(initial ? String(initial.image_width) : '128');
    setImageHeight(initial ? String(initial.image_height) : '128');
    setRepeatMode(initial?.repeat_mode ?? 'cover');
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
    const path = `${fondKey}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('fond-graphics')
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

    if (!fondKey || !title) {
      setError('fond_key et titre requis');
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
        fond_key: fondKey,
        title,
        description: description || null,
        kind,
        storage_path: finalPath,
        payload: finalPayload,
        image_width: iw,
        image_height: ih,
        repeat_mode: repeatMode,
        tokens: parsedTokens,
        is_default: isDefault,
        active_from: activeFrom ? new Date(activeFrom).toISOString() : null,
        active_until: activeUntil ? new Date(activeUntil).toISOString() : null,
        retired_at: retiredAt ? new Date(retiredAt).toISOString() : null,
      };
      const { data, error: upErr } = await supabase
        .from('fond_catalog')
        .upsert(row, { onConflict: 'fond_key' })
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
      onSaved(data as FondCatalogRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  async function retire() {
    if (!initial) return;
    if (!confirm(`Retirer le fond "${initial.title}" ?`)) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('fond_catalog')
      .update({ retired_at: new Date().toISOString() })
      .eq('fond_key', initial.fond_key);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted(initial.fond_key);
  }

  async function unretire() {
    if (!initial) return;
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('fond_catalog')
      .update({ retired_at: null })
      .eq('fond_key', initial.fond_key)
      .select()
      .single();
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(data as FondCatalogRow);
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
        ? `${SUPABASE_URL}/storage/v1/object/public/fond-graphics/${storagePath}`
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
                <PreviewFond
                  src={previewSrc}
                  repeatMode={repeatMode}
                  outerWidth={previewW}
                  outerHeight={previewH}
                />
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SizeSlider label="W" value={previewW} min={60} max={600} onChange={setPreviewW} />
                  <SizeSlider label="H" value={previewH} min={60} max={600} onChange={setPreviewH} />
                </div>
                <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
                  {previewW}×{previewH} — rendu {repeatMode === 'cover' ? 'crop center sans déformation' : 'tile (count entier)'}
                </div>
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12, padding: 24 }}>Sélectionne un fichier.</div>
            )}
          </div>
        </div>

        <div>
          <h2 style={{ marginTop: 0 }}>{isNew ? 'Nouveau fond' : fondKey}</h2>

          <div className="field">
            <label>fond_key</label>
            <input
              value={fondKey}
              onChange={(e) => setFondKey(e.target.value)}
              disabled={!isNew}
              placeholder="ex: linen_v1"
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
            <div className="field">
              <label>Repeat</label>
              <select
                value={repeatMode}
                onChange={(e) => setRepeatMode(e.target.value as FondRepeatMode)}>
                <option value="cover">cover — étire en couvrant la surface (crop center)</option>
                <option value="tile">tile — répète le motif (count entier)</option>
              </select>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                `cover` pour une photo/illustration plein cadre (crop centré sans déformation
                si l&apos;AR diffère). `tile` pour un motif répétable (papier, texture, pattern).
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

          <VisibilityFieldset
            isDefault={isDefault}
            setIsDefault={setIsDefault}
            helper="Coché : visible et sélectionnable par tous les users sans unlock préalable. Décoché : verrouillé — le user doit débloquer le fond (table user_fonds) pour le voir apparaître dans le perso."
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

// Preview web : approxime le rendering app. `cover` ⇒ background-size:cover
// (crop center sans déformation). `tile` ⇒ background-repeat:round (count
// entier scalé pour rentrer pile, équivalent du tile-mode app).
function PreviewFond({
  src,
  repeatMode,
  outerWidth,
  outerHeight,
}: {
  src: string;
  repeatMode: FondRepeatMode;
  outerWidth: number;
  outerHeight: number;
}) {
  const style: React.CSSProperties = {
    width: outerWidth,
    height: outerHeight,
    backgroundImage: `url(${src})`,
    backgroundColor: '#f4efe6',
    border: '1px dashed rgba(107,98,89,0.4)',
    borderRadius: 8,
  };
  if (repeatMode === 'cover') {
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
    style.backgroundRepeat = 'no-repeat';
  } else {
    // `round` ≈ tile-mode app (count entier scalé sans clipping). Browser
    // support large mais inégal — fallback sur `repeat` via la spec.
    style.backgroundRepeat = 'round';
  }
  return <div style={style} />;
}
