import { useRef } from 'react';
import { extractSvgDims, type DecorationKind } from './helpers';

type Props = {
  kind: DecorationKind;
  setKind: (k: DecorationKind) => void;
  // Fichier en attente d'upload (PNG) ou null. Le caller persiste à la save.
  pendingFile: File | null;
  setPendingFile: (f: File | null) => void;
  // Texte SVG en attente de persistance dans `payload`.
  pendingPayloadText: string | null;
  setPendingPayloadText: (t: string | null) => void;
  // Setter de preview live (URL/data URL). Le caller la lit pour le rendu
  // de prévisualisation et clean les blobs au save.
  setPendingPreview: (u: string | null) => void;
  // Path/payload existants (read-only ici). Affichés en hint si rien en attente.
  storagePath: string | null;
  payloadText: string | null;
  // Dimensions auto-detected. Le caller les écrit dans son state local.
  onDetectedDims: (w: number, h: number) => void;
};

// Sélecteur de kind (PNG/SVG/Lottie) + input file. Lit le SVG inline (text)
// pour `svg_9slice` (stocké en `payload`), upload le PNG en bucket pour
// `png_9slice`. Lottie est dispo dans le select mais désactivé (pas encore
// supporté côté rendu). Auto-detect des dims via parsing SVG ou Image natif.
export function KindFileFieldset({
  kind,
  setKind,
  pendingFile,
  setPendingFile,
  pendingPayloadText,
  setPendingPayloadText,
  setPendingPreview,
  storagePath,
  payloadText,
  onDetectedDims,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (kind === 'svg_9slice') {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        setPendingPayloadText(text);
        setPendingFile(null);
        const dims = extractSvgDims(text);
        if (dims) onDetectedDims(dims.w, dims.h);
        setPendingPreview(`data:image/svg+xml;utf8,${encodeURIComponent(text)}`);
      };
      reader.readAsText(file);
      return;
    }

    setPendingFile(file);
    setPendingPayloadText(null);
    const url = URL.createObjectURL(file);
    setPendingPreview(url);
    if (file.type === 'image/png' || file.type === 'image/jpeg') {
      const img = new Image();
      img.onload = () => {
        onDetectedDims(img.width, img.height);
      };
      img.src = url;
    }
  }

  return (
    <>
      <div className="field">
        <label>Type</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as DecorationKind)}>
          <option value="png_9slice">PNG</option>
          <option value="svg_9slice">SVG</option>
          <option value="lottie_9slice" disabled>Lottie (à venir)</option>
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
            Sauvegarde l&apos;entrée pour l&apos;uploader.
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
    </>
  );
}

