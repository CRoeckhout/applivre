import { useEffect, useRef, useState } from 'react';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import type { AvatarFrameCatalogRow, CatalogAvailability } from '../lib/types';
import { AvailabilityFieldset, PeriodFieldset } from './decoration-fields';

type Props = {
  initial: AvatarFrameCatalogRow | null;
  onSaved: (saved: AvatarFrameCatalogRow) => void;
  onDeleted: (key: string) => void;
};

// Avatar de démo pour la preview du cadre. URL d'un placeholder unicolore
// servi par Supabase Storage est overkill — on utilise un data URI avec un
// SVG circulaire portant les initiales "AV" pour rester self-contained.
const DEMO_AVATAR_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
       <rect width="100" height="100" fill="#c27b52"/>
       <text x="50" y="58" text-anchor="middle" font-size="38" font-family="system-ui" font-weight="700" fill="#fbf8f4">AV</text>
     </svg>`,
  );

export function AvatarFrameForm({ initial, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  const [frameKey, setFrameKey] = useState(initial?.frame_key ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageWidth, setImageWidth] = useState<string>(
    initial ? String(initial.image_width) : '256',
  );
  const [imageHeight, setImageHeight] = useState<string>(
    initial ? String(initial.image_height) : '256',
  );
  const [imageScale, setImageScale] = useState<number>(initial?.image_scale ?? 0.8);
  const [imagePadding, setImagePadding] = useState<number>(initial?.image_padding ?? 0);
  const [availability, setAvailability] = useState<CatalogAvailability>(
    initial?.availability ?? 'badge',
  );
  const [activeFrom, setActiveFrom] = useState(initial?.active_from?.slice(0, 16) ?? '');
  const [activeUntil, setActiveUntil] = useState(initial?.active_until?.slice(0, 16) ?? '');
  const [retiredAt, setRetiredAt] = useState(initial?.retired_at?.slice(0, 16) ?? '');

  const [storagePath, setStoragePath] = useState<string | null>(initial?.storage_path ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Taille du container de preview en pixels DOM. Sert uniquement au rendu
  // de la preview (la taille effective dans l'app est déterminée par le
  // composant qui utilise le cadre, e.g. UserProfileCard = 56px).
  const [previewSize, setPreviewSize] = useState(180);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFrameKey(initial?.frame_key ?? '');
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setImageWidth(initial ? String(initial.image_width) : '256');
    setImageHeight(initial ? String(initial.image_height) : '256');
    setImageScale(initial?.image_scale ?? 0.8);
    setImagePadding(initial?.image_padding ?? 0);
    setAvailability(initial?.availability ?? 'badge');
    setActiveFrom(initial?.active_from?.slice(0, 16) ?? '');
    setActiveUntil(initial?.active_until?.slice(0, 16) ?? '');
    setRetiredAt(initial?.retired_at?.slice(0, 16) ?? '');
    setStoragePath(initial?.storage_path ?? null);
    setPendingFile(null);
    setPendingPreview(null);
    setError(null);
    setSuccess(null);
  }, [initial]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (pendingPreview && pendingPreview.startsWith('blob:')) {
      URL.revokeObjectURL(pendingPreview);
    }
    const url = URL.createObjectURL(file);
    setPendingPreview(url);
    const img = new Image();
    img.onload = () => {
      setImageWidth(String(img.width));
      setImageHeight(String(img.height));
    };
    img.src = url;
  }

  function clearPendingFile() {
    if (pendingPreview && pendingPreview.startsWith('blob:')) {
      URL.revokeObjectURL(pendingPreview);
    }
    setPendingFile(null);
    setPendingPreview(null);
  }

  async function uploadFileIfPending(): Promise<string | null> {
    if (!pendingFile) return storagePath;
    const ext = pendingFile.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${frameKey}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatar-frame-graphics')
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

    if (!frameKey || !title) {
      setError('frame_key et titre requis');
      return;
    }

    const iw = Number.parseInt(imageWidth, 10);
    const ih = Number.parseInt(imageHeight, 10);
    if (![iw, ih].every((n) => Number.isFinite(n) && n > 0)) {
      setError('Dimensions doivent être des entiers > 0');
      return;
    }
    if (!pendingFile && !storagePath) {
      setError('PNG requis');
      return;
    }
    if (!Number.isFinite(imageScale) || imageScale <= 0 || imageScale > 1) {
      setError('Échelle photo doit être ∈ ]0, 1]');
      return;
    }
    if (!Number.isFinite(imagePadding) || imagePadding < 0) {
      setError('Padding doit être ≥ 0');
      return;
    }

    setSubmitting(true);
    try {
      const finalPath = await uploadFileIfPending();

      const row = {
        frame_key: frameKey,
        title,
        description: description || null,
        kind: 'png' as const,
        storage_path: finalPath,
        payload: null,
        image_width: iw,
        image_height: ih,
        image_scale: imageScale,
        image_padding: Math.round(imagePadding),
        tokens: {},
        availability,
        unlock_badge_key: initial?.unlock_badge_key ?? null,
        active_from: activeFrom ? new Date(activeFrom).toISOString() : null,
        active_until: activeUntil ? new Date(activeUntil).toISOString() : null,
        retired_at: retiredAt ? new Date(retiredAt).toISOString() : null,
      };
      const { data, error: upErr } = await supabase
        .from('avatar_frame_catalog')
        .upsert(row, { onConflict: 'frame_key' })
        .select()
        .single();
      if (upErr) {
        setError(`Save échec : ${upErr.message}`);
        return;
      }
      setStoragePath(finalPath);
      clearPendingFile();
      setSuccess('Enregistré.');
      onSaved(data as AvatarFrameCatalogRow);
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
      .from('avatar_frame_catalog')
      .update({ retired_at: new Date().toISOString() })
      .eq('frame_key', initial.frame_key);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted(initial.frame_key);
  }

  async function unretire() {
    if (!initial) return;
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('avatar_frame_catalog')
      .update({ retired_at: null })
      .eq('frame_key', initial.frame_key)
      .select()
      .single();
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(data as AvatarFrameCatalogRow);
  }

  const previewSrc = pendingPreview
    ? pendingPreview
    : storagePath
      ? `${SUPABASE_URL}/storage/v1/object/public/avatar-frame-graphics/${storagePath}`
      : null;

  // Padding effectif en pixels DOM = padding natif × ratio (previewSize / image_width).
  // Le côté app fera la même mise à l'échelle (cf. avatar-frame.tsx).
  const iwNum = Number.parseInt(imageWidth, 10) || 1;
  const previewPaddingPx = (imagePadding * previewSize) / iwNum;
  // Rapport effectif (photo / cadre extérieur). On garde la photo à
  // `previewSize` et c'est le cadre qui déborde vers l'extérieur — même
  // logique que `<AvatarFrame>` côté app, pour que la preview admin reflète
  // exactement le rendu runtime.
  const ratio = Math.max(0.05, imageScale - (2 * previewPaddingPx) / previewSize);
  const frameOuterSize = previewSize / ratio;
  const frameOffset = (frameOuterSize - previewSize) / 2;

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
          <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
            {previewSrc ? (
              <>
                <div
                  style={{
                    position: 'relative',
                    width: previewSize,
                    height: previewSize,
                  }}>
                  {/* Avatar de démo : taille fixe = container ; c'est le
                      cadre qui s'étend vers l'extérieur. */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: '#c27b52',
                    }}>
                    <img
                      src={DEMO_AVATAR_DATA_URI}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  {/* Cadre PNG en overlay, débordant vers l'extérieur. */}
                  <img
                    src={previewSrc}
                    alt=""
                    style={{
                      position: 'absolute',
                      top: -frameOffset,
                      left: -frameOffset,
                      width: frameOuterSize,
                      height: frameOuterSize,
                      pointerEvents: 'none',
                    }}
                  />
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 60, color: 'var(--ink-muted)' }}>Preview</span>
                    <input
                      type="range"
                      min={80}
                      max={320}
                      value={previewSize}
                      onChange={(e) => setPreviewSize(Number.parseInt(e.target.value, 10))}
                      style={{ flex: 1 }}
                    />
                    <span style={{ width: 40 }}>{previewSize}px</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12, padding: 24 }}>Sélectionne un PNG.</div>
            )}
          </div>
        </div>

        <div>
          <h2 style={{ marginTop: 0 }}>{isNew ? 'Nouveau cadre photo' : frameKey}</h2>

          <div className="field">
            <label>frame_key</label>
            <input
              value={frameKey}
              onChange={(e) => setFrameKey(e.target.value)}
              disabled={!isNew}
              placeholder="ex: gold_ring_v1"
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
              <label>Fichier (.png)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                onChange={handleFileSelect}
              />
              {pendingFile && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  En attente : {pendingFile.name} ({Math.round(pendingFile.size / 1024)} KB).
                  Sauvegarde l&apos;entrée pour l&apos;uploader.
                </div>
              )}
              {!pendingFile && storagePath && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Existant : <code>{storagePath}</code>
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
            <div className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 12 }}>
              Le cadre est rendu carré côté app (border-radius full) ; un PNG carré
              (largeur = hauteur) garantit un cercle parfait.
            </div>
          </fieldset>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', padding: '0 6px' }}>Photo dans le cadre</legend>
            <div className="field">
              <label>
                Échelle photo : {imageScale.toFixed(2)} ({Math.round(imageScale * 100)}%)
              </label>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={imageScale}
                onChange={(e) => setImageScale(Number.parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Fraction de la dimension extérieure du cadre occupée par la photo.
                Compense l&apos;épaisseur du cadre (cadres ornés ⇒ scale plus bas).
              </div>
            </div>
            <div className="field">
              <label>Padding interne ({imagePadding}px en espace natif)</label>
              <input
                type="range"
                min={0}
                max={Math.max(64, Math.floor((Number.parseInt(imageWidth, 10) || 256) / 4))}
                step={1}
                value={imagePadding}
                onChange={(e) => setImagePadding(Number.parseInt(e.target.value, 10))}
                style={{ width: '100%' }}
              />
              <input
                type="number"
                min={0}
                value={imagePadding}
                onChange={(e) =>
                  setImagePadding(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
                }
                style={{ width: 80, marginTop: 4 }}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Inset additionnel autour de la photo, en pixels dans le repère natif
                du PNG. Mis à l&apos;échelle automatiquement au rendu.
              </div>
            </div>
          </fieldset>

          <AvailabilityFieldset
            availability={availability}
            setAvailability={setAvailability}
            helper="Disponible pour tous : utilisable sans condition. Premium : visible avec étoile, paywall au clic si non-premium. Obtention d'un badge : caché tant que le badge n'est pas obtenu (unlock via user_avatar_frames). À l'unité : à venir."
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
