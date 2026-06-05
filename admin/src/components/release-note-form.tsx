import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BlockEditor } from './block-editor';
import type { ReleaseNoteBlock, ReleaseNoteRow } from '../lib/types';

type Props = {
  initial: ReleaseNoteRow | null;
  onSaved: (saved: ReleaseNoteRow) => void;
  onDeleted: (id: string) => void;
};

const ASSETS_BUCKET = 'release-notes-assets';

export function ReleaseNoteForm({ initial, onSaved, onDeleted }: Props) {
  const isNew = initial === null;
  // Création : pré-remplit avec la version courante d'`app.json`
  // (injectée par Vite via `__APP_VERSION__`). Édition : on garde la
  // version existante en base.
  const [version, setVersion] = useState(initial?.version ?? __APP_VERSION__);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [publishedAt, setPublishedAt] = useState(
    initial?.published_at ? toLocalInput(initial.published_at) : toLocalInput(new Date().toISOString()),
  );
  // L'éditeur de blocs (BlockEditor) possède son propre état (remonté via la
  // `key`) et nous remonte les blocs purs via onChange. Ici on garde la
  // dernière valeur pour le save.
  const [blocks, setBlocks] = useState<ReleaseNoteBlock[]>(() => initial?.body ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setVersion(initial?.version ?? __APP_VERSION__);
    setTitle(initial?.title ?? '');
    setPublishedAt(
      initial?.published_at
        ? toLocalInput(initial.published_at)
        : toLocalInput(new Date().toISOString()),
    );
    setBlocks(initial?.body ?? []);
    setError(null);
    setSuccess(null);
  }, [initial]);

  async function save() {
    setError(null);
    setSuccess(null);

    const v = version.trim();
    const t = title.trim();
    if (!v || !t) {
      setError('version et titre requis');
      return;
    }
    if (!/^[0-9]+(\.[0-9]+){0,3}$/.test(v)) {
      setError('version doit être numérique style "1.2.0"');
      return;
    }

    setSubmitting(true);
    try {
      const row = {
        version: v,
        title: t,
        body: blocks,
        published_at: new Date(publishedAt).toISOString(),
      };
      let saved: ReleaseNoteRow;
      if (isNew) {
        const { data, error: err } = await supabase
          .from('release_notes')
          .insert(row)
          .select()
          .single();
        if (err) {
          setError(err.message);
          return;
        }
        saved = data as ReleaseNoteRow;
      } else {
        const { data, error: err } = await supabase
          .from('release_notes')
          .update(row)
          .eq('id', initial!.id)
          .select()
          .single();
        if (err) {
          setError(err.message);
          return;
        }
        saved = data as ReleaseNoteRow;
      }
      setSuccess('Enregistré.');
      onSaved(saved);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Supprimer la note v${initial.version} ? Cette action est irréversible.`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from('release_notes')
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
        <h2 style={{ marginTop: 0 }}>{isNew ? 'Nouvelle note' : `v${initial?.version}`}</h2>

        <div className="field">
          <label>Version</label>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="ex: 1.2.0"
          />
          <div className="muted" style={{ fontSize: 12 }}>
            Version courante de l'app : <code>{__APP_VERSION__}</code>{' '}
            {version !== __APP_VERSION__ && (
              <button
                type="button"
                className="btn"
                style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11 }}
                onClick={() => setVersion(__APP_VERSION__)}>
                Réinitialiser
              </button>
            )}
            <div style={{ marginTop: 4 }}>
              Lue depuis <code>app.json</code> au build. Programme{' '}
              <code>published_at</code> à la date d'approbation store estimée
              pour différer l'affichage côté users.
            </div>
          </div>
        </div>

        <div className="field">
          <label>Titre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex: Lecture audio améliorée"
          />
        </div>

        <div className="field">
          <label>Date de publication</label>
          <input
            type="datetime-local"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
          />
          <div className="muted" style={{ fontSize: 12 }}>
            Date future ⇒ note programmée (cachée aux users jusqu'à cette date).
          </div>
        </div>

        <BlockEditor
          key={initial?.id ?? 'new'}
          initialBlocks={initial?.body ?? []}
          onChange={setBlocks}
          assetsBucket={ASSETS_BUCKET}
        />

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

// Convertit un ISO timestamp en valeur acceptée par <input type="datetime-local">
// (yyyy-MM-ddTHH:mm, sans timezone).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
