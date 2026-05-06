import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { MusicThemeTrackRow } from '../lib/types';

type Props = {
  themeId: string;
  themeKey: string;
  initial: MusicThemeTrackRow | null;
  onSaved: (saved: MusicThemeTrackRow) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
};

export function MusicTrackForm({
  themeId,
  themeKey,
  initial,
  onSaved,
  onDeleted,
  onCancel,
}: Props) {
  const isNew = initial === null;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [sortOrder, setSortOrder] = useState<string>(
    initial ? String(initial.sort_order) : '0',
  );
  const [isActive, setIsActive] = useState<boolean>(initial?.is_active ?? true);
  const [storagePath, setStoragePath] = useState<string | null>(
    initial?.storage_path ?? null,
  );
  const [durationMs, setDurationMs] = useState<number | null>(
    initial?.duration_ms ?? null,
  );

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(initial?.title ?? '');
    setSortOrder(initial ? String(initial.sort_order) : '0');
    setIsActive(initial?.is_active ?? true);
    setStoragePath(initial?.storage_path ?? null);
    setDurationMs(initial?.duration_ms ?? null);
    clearPendingFile();
    setError(null);
    setSuccess(null);
  }, [initial]);

  // Charge une URL signée pour la piste existante (preview audio).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!storagePath || pendingFile) {
        setPreviewUrl(null);
        return;
      }
      const { data, error: signErr } = await supabase.storage
        .from('music-theme-tracks')
        .createSignedUrl(storagePath, 3600);
      if (cancelled) return;
      if (signErr) {
        setPreviewUrl(null);
        return;
      }
      setPreviewUrl(data.signedUrl);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [storagePath, pendingFile]);

  function clearPendingFile() {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(null);
    setPendingUrl(null);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    const url = URL.createObjectURL(file);
    setPendingFile(file);
    setPendingUrl(url);
    if (!title) setTitle(stripExtension(file.name));

    // Lit la durée du fichier audio en local pour pré-remplir duration_ms.
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationMs(Math.round(audio.duration * 1000));
      }
    });
    audio.addEventListener('error', () => {
      // ignore — duration_ms restera null
    });
  }

  async function uploadFileIfPending(): Promise<string | null> {
    if (!pendingFile) return storagePath;
    const ext = pendingFile.name.split('.').pop()?.toLowerCase() ?? 'mp3';
    const path = `${themeKey}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('music-theme-tracks')
      .upload(path, pendingFile, {
        upsert: false,
        contentType: pendingFile.type || 'audio/mpeg',
      });
    if (upErr) throw new Error(`Upload échec : ${upErr.message}`);
    return path;
  }

  async function save() {
    setError(null);
    setSuccess(null);

    if (!title) {
      setError('Titre requis');
      return;
    }
    if (isNew && !pendingFile) {
      setError('Fichier audio requis');
      return;
    }
    const so = Number.parseInt(sortOrder, 10);
    if (!Number.isFinite(so)) {
      setError('sort_order doit être un entier');
      return;
    }

    setSubmitting(true);
    try {
      const oldPath = initial?.storage_path ?? null;
      const finalPath = await uploadFileIfPending();
      if (!finalPath) {
        setError('Chemin de fichier manquant');
        return;
      }

      const row = {
        theme_id: themeId,
        title,
        storage_path: finalPath,
        sort_order: so,
        is_active: isActive,
        duration_ms: durationMs,
      };

      const query = initial
        ? supabase
            .from('music_theme_tracks')
            .update(row)
            .eq('id', initial.id)
            .select()
            .single()
        : supabase
            .from('music_theme_tracks')
            .insert(row)
            .select()
            .single();
      const { data, error: upErr } = await query;
      if (upErr) {
        setError(`Save échec : ${upErr.message}`);
        return;
      }

      // Best-effort : supprime l'ancien fichier si remplacé. On ignore les
      // erreurs (orphan acceptable).
      if (pendingFile && oldPath && oldPath !== finalPath) {
        await supabase.storage.from('music-theme-tracks').remove([oldPath]);
      }

      setStoragePath(finalPath);
      clearPendingFile();
      setSuccess('Enregistré.');
      onSaved(data as MusicThemeTrackRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Supprimer la piste "${initial.title}" ?`)) return;
    setSubmitting(true);
    setError(null);

    const { error: dbErr } = await supabase
      .from('music_theme_tracks')
      .delete()
      .eq('id', initial.id);

    if (dbErr) {
      setSubmitting(false);
      setError(dbErr.message);
      return;
    }

    // Best-effort : supprime aussi le fichier Storage.
    if (initial.storage_path) {
      await supabase.storage
        .from('music-theme-tracks')
        .remove([initial.storage_path]);
    }

    setSubmitting(false);
    onDeleted(initial.id);
  }

  const audioSrc = pendingUrl ?? previewUrl;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn" onClick={onCancel} type="button">
          ← Retour
        </button>
        <h2 style={{ margin: 0, fontSize: 18 }}>
          {isNew ? 'Nouvelle piste' : initial.title}
        </h2>
      </div>

      <div className="field">
        <label>Titre</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ex: Forêt brumeuse"
        />
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>sort_order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingBottom: 8,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Actif</span>
        </label>
      </div>

      <div className="field">
        <label>Fichier audio (mp3, m4a, …)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={onFileChange}
        />
        {storagePath && !pendingFile && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Actuel : <code>{storagePath}</code>
          </div>
        )}
        {pendingFile && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Nouveau : {pendingFile.name} (
            {(pendingFile.size / (1024 * 1024)).toFixed(2)} MB)
          </div>
        )}
        {durationMs !== null && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Durée : {formatDuration(durationMs)}
          </div>
        )}
      </div>

      {audioSrc && (
        <audio controls src={audioSrc} style={{ width: '100%' }} />
      )}

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

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
  );
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
