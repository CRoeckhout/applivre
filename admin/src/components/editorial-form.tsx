import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BlockEditor } from './block-editor';
import { EditorialKindPill } from './editorial-kind-pill';
import { EditorialPreview } from './editorial-preview';
import { RichTextInput } from './rich-text-input';
import {
  EDITORIAL_KIND_LABELS,
  EDITORIAL_MANUAL_KINDS,
  EDITORIAL_STATUS_LABELS,
  type EditorialPostKind,
  type EditorialPostRow,
  type EditorialPostStatus,
  type EditorialRefKind,
  type EditorialSeed,
  type ReleaseNoteBlock,
} from '../lib/types';

type Props = {
  initial: EditorialPostRow | null;
  // Graine de pré-remplissage pour une création depuis un candidat promu
  // (type/cible/titre/couverture). Ignorée si `initial` est fourni (édition).
  seed?: EditorialSeed | null;
  onSaved: (saved: EditorialPostRow) => void;
  onDeleted: (id: string) => void;
};

const REF_KIND_DESTINATION: Record<EditorialRefKind, string> = {
  book: 'la page du livre',
  sheet: 'la fiche de lecture',
  feed_entry: 'la publication',
};

const ASSETS_BUCKET = 'editorial-assets';
const STATUSES: EditorialPostStatus[] = ['draft', 'published', 'archived'];

export function EditorialForm({ initial, seed = null, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  // Kind : annonce / partenariat à la main, ou featured_* via une graine
  // (candidat promu) / un post existant. La cible (ref_kind/ref_id) est portée
  // par la graine ou le post et persistée telle quelle.
  const [kind, setKind] = useState<EditorialPostKind>(
    initial?.kind ?? seed?.kind ?? EDITORIAL_MANUAL_KINDS[0],
  );
  const [title, setTitle] = useState(initial?.title ?? seed?.title ?? '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? seed?.subtitle ?? '');
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url ?? seed?.cover_url ?? '');
  const [refKind, setRefKind] = useState<EditorialRefKind | null>(
    initial?.ref_kind ?? seed?.ref_kind ?? null,
  );
  const [refId, setRefId] = useState<string | null>(initial?.ref_id ?? seed?.ref_id ?? null);
  // Avis mis en avant : id de l'avis ciblé. Porté par la graine (candidat) ou
  // le post existant, persisté tel quel (pas d'UI — comme ref_kind/ref_id).
  const [reviewId, setReviewId] = useState<string | null>(
    initial?.review_id ?? seed?.review_id ?? null,
  );
  const [ctaLabel, setCtaLabel] = useState(initial?.cta?.label ?? '');
  const [ctaDeeplink, setCtaDeeplink] = useState(initial?.cta?.deeplink ?? '');
  const [status, setStatus] = useState<EditorialPostStatus>(initial?.status ?? 'draft');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [priority, setPriority] = useState(String(initial?.priority ?? 0));
  const [publishAt, setPublishAt] = useState(
    toLocalInput(initial?.publish_at ?? new Date().toISOString()),
  );
  const [expireAt, setExpireAt] = useState(
    initial?.expire_at ? toLocalInput(initial.expire_at) : '',
  );
  const [blocks, setBlocks] = useState<ReleaseNoteBlock[]>(() => initial?.body ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setKind(initial?.kind ?? seed?.kind ?? EDITORIAL_MANUAL_KINDS[0]);
    setTitle(initial?.title ?? seed?.title ?? '');
    setSubtitle(initial?.subtitle ?? seed?.subtitle ?? '');
    setCoverUrl(initial?.cover_url ?? seed?.cover_url ?? '');
    setRefKind(initial?.ref_kind ?? seed?.ref_kind ?? null);
    setRefId(initial?.ref_id ?? seed?.ref_id ?? null);
    setReviewId(initial?.review_id ?? seed?.review_id ?? null);
    setCtaLabel(initial?.cta?.label ?? '');
    setCtaDeeplink(initial?.cta?.deeplink ?? '');
    setStatus(initial?.status ?? 'draft');
    setPinned(initial?.pinned ?? false);
    setPriority(String(initial?.priority ?? 0));
    setPublishAt(toLocalInput(initial?.publish_at ?? new Date().toISOString()));
    setExpireAt(initial?.expire_at ? toLocalInput(initial.expire_at) : '');
    setBlocks(initial?.body ?? []);
    setError(null);
    setSuccess(null);
  }, [initial, seed]);

  // Les featured_* (cible mise en avant) ne sont pas éditables au clavier ici :
  // on garde le kind tel quel mais on n'expose pas le sélecteur.
  const isFeatured = !EDITORIAL_MANUAL_KINDS.includes(kind);

  async function save() {
    setError(null);
    setSuccess(null);

    const t = title.trim();
    if (!t) {
      setError('titre requis');
      return;
    }
    const cta =
      ctaLabel.trim() && ctaDeeplink.trim()
        ? { label: ctaLabel.trim(), deeplink: ctaDeeplink.trim() }
        : null;
    if ((ctaLabel.trim() && !ctaDeeplink.trim()) || (!ctaLabel.trim() && ctaDeeplink.trim())) {
      setError('le bouton d’action demande un libellé ET un lien');
      return;
    }

    setSubmitting(true);
    try {
      // ref_kind / ref_id portent la cible mise en avant (null pour les
      // annonces). Persistés tels quels depuis la graine ou le post existant.
      const payload = {
        kind,
        title: t,
        subtitle: subtitle.trim() || null,
        body: blocks,
        ref_kind: refKind,
        ref_id: refId,
        review_id: reviewId,
        cover_url: coverUrl.trim() || null,
        cta,
        status,
        pinned,
        priority: Number.isFinite(Number(priority)) ? parseInt(priority, 10) : 0,
        publish_at: new Date(publishAt).toISOString(),
        expire_at: expireAt ? new Date(expireAt).toISOString() : null,
      };

      let saved: EditorialPostRow;
      if (isNew) {
        const { data: userData } = await supabase.auth.getUser();
        const { data, error: err } = await supabase
          .from('editorial_posts')
          .insert({ ...payload, author_id: userData.user?.id ?? null })
          .select()
          .single();
        if (err) {
          setError(err.message);
          return;
        }
        saved = data as EditorialPostRow;
      } else {
        const { data, error: err } = await supabase
          .from('editorial_posts')
          .update(payload)
          .eq('id', initial!.id)
          .select()
          .single();
        if (err) {
          setError(err.message);
          return;
        }
        saved = data as EditorialPostRow;
      }
      setSuccess('Enregistré.');
      onSaved(saved);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Supprimer « ${initial.title} » ? Cette action est irréversible.`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('editorial_posts')
      .delete()
      .eq('id', initial.id);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted(initial.id);
  }

  return (
    <main style={{ flex: 1, padding: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 720,
          margin: '0 auto',
          padding: '16px 24px 24px',
        }}>
        <h2 style={{ marginTop: 0 }}>
          {isNew ? 'Nouvelle publication' : initial?.title || 'Publication'}
        </h2>

        <div className="field">
          <label>Aperçu</label>
          <EditorialPreview
            kind={kind}
            title={title}
            subtitle={subtitle}
            coverUrl={coverUrl}
            cta={ctaLabel.trim() ? { label: ctaLabel.trim(), deeplink: ctaDeeplink } : null}
            reviewId={reviewId}
          />
        </div>

        {isFeatured ? (
          <div className="field">
            <label>Type</label>
            <div>
              <EditorialKindPill kind={kind} />
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Mise en avant générée via le panneau candidats — le type n'est pas
              modifiable ici.
              {refKind ? ` Au tap, ouvre ${REF_KIND_DESTINATION[refKind]}.` : ''}
            </div>
          </div>
        ) : (
          <div className="field">
            <label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as EditorialPostKind)}>
              {EDITORIAL_MANUAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EDITORIAL_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>Titre</label>
          <RichTextInput
            value={title}
            onChange={setTitle}
            placeholder="ex: Nouveau design « Forêt enchantée »"
          />
        </div>

        <div className="field">
          <label>Sous-titre (optionnel)</label>
          <RichTextInput
            value={subtitle}
            onChange={setSubtitle}
            placeholder="Court teaser affiché sur la bannière et le hero"
          />
        </div>

        <CoverUploader value={coverUrl} onChange={setCoverUrl} />

        <BlockEditor
          key={initial?.id ?? 'new'}
          initialBlocks={initial?.body ?? []}
          onChange={setBlocks}
          assetsBucket={ASSETS_BUCKET}
        />

        <fieldset
          style={{
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}>
          <legend
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink-muted)',
              textTransform: 'uppercase',
              padding: '0 6px',
            }}>
            Bouton d'action (optionnel)
          </legend>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Libellé</label>
            <input
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="ex: Découvrir"
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Lien / deeplink</label>
            <input
              value={ctaDeeplink}
              onChange={(e) => setCtaDeeplink(e.target.value)}
              placeholder="ex: grimolia://templates ou https://…"
            />
          </div>
        </fieldset>

        <div className="field">
          <label>Statut</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as EditorialPostStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {EDITORIAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <div className="muted" style={{ fontSize: 12 }}>
            Seuls les posts <code>Publié</code> (et dont la date de publication
            est passée) sont visibles dans l'app.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Date de publication</label>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12 }}>
              Date future ⇒ programmé.
            </div>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Date d'expiration (optionnel)</label>
            <input
              type="datetime-local"
              value={expireAt}
              onChange={(e) => setExpireAt(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12 }}>
              Retrait auto à cette date.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Épinglé (carrousel « À la une »)
            </label>
          </div>
          <div className="field" style={{ margin: 0, width: 140 }}>
            <label>Priorité</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
        {success && <div className="success" style={{ marginBottom: 12 }}>{success}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={save} disabled={submitting}>
            {submitting ? 'Enregistrement…' : isNew ? 'Créer' : 'Enregistrer'}
          </button>
          {!isNew && (
            <button className="btn btn-danger" onClick={remove} disabled={submitting}>
              Supprimer
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function CoverUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const slug = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 40);
      const path = `cover-${Date.now()}-${slug}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(ASSETS_BUCKET)
        .upload(path, file, { upsert: false });
      if (uploadErr) {
        setUploadError(uploadErr.message);
        return;
      }
      const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="field">
      <label>Couverture (optionnel)</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://… ou upload ci-dessous"
      />
      <input
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={handleUpload}
        disabled={uploading}
        style={{ marginTop: 6 }}
      />
      {uploading && (
        <div className="muted" style={{ fontSize: 12 }}>
          Upload en cours…
        </div>
      )}
      {uploadError && <div className="error">{uploadError}</div>}
      {value && (
        <img
          src={value}
          alt=""
          style={{
            marginTop: 8,
            maxWidth: '100%',
            maxHeight: 200,
            borderRadius: 8,
            objectFit: 'cover',
            border: '1px solid var(--line)',
          }}
        />
      )}
    </div>
  );
}

// Convertit un ISO timestamp en valeur acceptée par <input type="datetime-local">
// (yyyy-MM-ddTHH:mm, sans timezone).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
