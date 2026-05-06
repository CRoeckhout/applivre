import { useEffect, useState } from 'react';
import { MusicThemeForm } from '../components/music-theme-form';
import { MusicTrackForm } from '../components/music-track-form';
import { supabase } from '../lib/supabase';
import type { MusicThemeRow, MusicThemeTrackRow } from '../lib/types';

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

type TrackState =
  | { kind: 'list' }
  | { kind: 'creating' }
  | { kind: 'editing'; trackId: string };

export function MusiquesSection({ itemId, onItemChange }: Props) {
  const [themes, setThemes] = useState<MusicThemeRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [creatingTheme, setCreatingTheme] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tracks, setTracks] = useState<MusicThemeTrackRow[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [trackState, setTrackState] = useState<TrackState>({ kind: 'list' });

  useEffect(() => {
    void loadThemes();
  }, []);

  // L'itemId routé est la `key` du thème. On résout vers la row.
  const selectedTheme = creatingTheme
    ? null
    : (themes.find((t) => t.key === itemId) ?? null);

  // Charge les pistes quand on change de thème sélectionné. Reset l'état du
  // sub-form (track creating/editing).
  useEffect(() => {
    setTrackState({ kind: 'list' });
    if (!selectedTheme) {
      setTracks([]);
      return;
    }
    void loadTracks(selectedTheme.id);
  }, [selectedTheme?.id]);

  async function loadThemes() {
    setLoadError(null);
    const { data, error } = await supabase
      .from('music_themes')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setThemes((data ?? []) as MusicThemeRow[]);
  }

  async function loadTracks(themeId: string) {
    setTracksLoading(true);
    const { data, error } = await supabase
      .from('music_theme_tracks')
      .select('*')
      .eq('theme_id', themeId)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });
    setTracksLoading(false);
    if (error) return;
    setTracks((data ?? []) as MusicThemeTrackRow[]);
  }

  function onThemeSaved(saved: MusicThemeRow) {
    setThemes((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx === -1)
        return [...prev, saved].sort(
          (a, b) =>
            a.sort_order - b.sort_order ||
            a.display_name.localeCompare(b.display_name),
        );
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    onItemChange(saved.key);
    setCreatingTheme(false);
  }

  function onThemeDeleted() {
    void loadThemes();
    onItemChange(null);
    setCreatingTheme(false);
  }

  function onTrackSaved(saved: MusicThemeTrackRow) {
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx === -1)
        return [...prev, saved].sort(
          (a, b) =>
            a.sort_order - b.sort_order || a.title.localeCompare(b.title),
        );
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    setTrackState({ kind: 'list' });
  }

  function onTrackDeleted(id: string) {
    setTracks((prev) => prev.filter((t) => t.id !== id));
    setTrackState({ kind: 'list' });
  }

  const filteredThemes = themes.filter((t) => {
    if (filter === 'active') return t.is_active;
    if (filter === 'inactive') return !t.is_active;
    return true;
  });

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <ThemesList
        themes={filteredThemes}
        selectedKey={creatingTheme ? null : itemId}
        filter={filter}
        onFilterChange={setFilter}
        onSelect={(k) => {
          onItemChange(k);
          setCreatingTheme(false);
        }}
        onNew={() => {
          setCreatingTheme(true);
          onItemChange(null);
        }}
      />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'auto',
        }}
      >
        {loadError && (
          <div className="error" style={{ padding: 12 }}>
            Load error: {loadError}
          </div>
        )}

        {creatingTheme && (
          <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', width: '100%' }}>
            <MusicThemeForm
              initial={null}
              onSaved={onThemeSaved}
              onDeleted={onThemeDeleted}
            />
          </div>
        )}

        {selectedTheme && (
          <div
            style={{
              padding: 24,
              maxWidth: 720,
              margin: '0 auto',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            <MusicThemeForm
              initial={selectedTheme}
              onSaved={onThemeSaved}
              onDeleted={onThemeDeleted}
            />

            {trackState.kind === 'list' && (
              <TracksList
                tracks={tracks}
                loading={tracksLoading}
                onAdd={() => setTrackState({ kind: 'creating' })}
                onEdit={(id) => setTrackState({ kind: 'editing', trackId: id })}
              />
            )}

            {trackState.kind === 'creating' && (
              <MusicTrackForm
                themeId={selectedTheme.id}
                themeKey={selectedTheme.key}
                initial={null}
                onSaved={onTrackSaved}
                onDeleted={onTrackDeleted}
                onCancel={() => setTrackState({ kind: 'list' })}
              />
            )}

            {trackState.kind === 'editing' && (
              <MusicTrackForm
                themeId={selectedTheme.id}
                themeKey={selectedTheme.key}
                initial={
                  tracks.find((t) => t.id === trackState.trackId) ?? null
                }
                onSaved={onTrackSaved}
                onDeleted={onTrackDeleted}
                onCancel={() => setTrackState({ kind: 'list' })}
              />
            )}
          </div>
        )}

        {!creatingTheme && !selectedTheme && (
          <main
            style={{ flex: 1, padding: 40, textAlign: 'center' }}
            className="muted"
          >
            Sélectionne un thème à gauche ou crée-en un nouveau.
          </main>
        )}
      </div>
    </div>
  );
}

function ThemesList({
  themes,
  selectedKey,
  filter,
  onFilterChange,
  onSelect,
  onNew,
}: {
  themes: MusicThemeRow[];
  selectedKey: string | null;
  filter: 'all' | 'active' | 'inactive';
  onFilterChange: (f: 'all' | 'active' | 'inactive') => void;
  onSelect: (key: string) => void;
  onNew: () => void;
}) {
  return (
    <aside
      style={{
        width: 320,
        borderRight: '1px solid var(--line)',
        overflow: 'auto',
        background: 'var(--surface)',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          background: 'var(--surface)',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="btn btn-primary" onClick={onNew}>
            + Nouveau thème
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'active', 'inactive'] as const).map((k) => (
            <button
              key={k}
              className="btn"
              style={
                filter === k
                  ? {
                      background: 'var(--accent)',
                      color: 'white',
                      borderColor: 'var(--accent)',
                    }
                  : {}
              }
              onClick={() => onFilterChange(k)}
            >
              {k === 'all' ? 'Tous' : k === 'active' ? 'Actifs' : 'Inactifs'}
            </button>
          ))}
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {themes.map((t) => {
          const selected = selectedKey === t.key;
          return (
            <li
              key={t.id}
              onClick={() => onSelect(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                background: selected ? 'var(--surface-2)' : 'transparent',
                borderBottom: '1px solid var(--line)',
                opacity: t.is_active ? 1 : 0.55,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.display_name}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {t.key} · ordre {t.sort_order}
                </div>
              </div>
              {!t.is_active && <span className="tag tag-retired">Inactif</span>}
            </li>
          );
        })}
        {themes.length === 0 && (
          <li style={{ padding: 24, textAlign: 'center' }} className="muted">
            Aucun thème
          </li>
        )}
      </ul>
    </aside>
  );
}

function TracksList({
  tracks,
  loading,
  onAdd,
  onEdit,
}: {
  tracks: MusicThemeTrackRow[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (id: string) => void;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>
          Pistes ({tracks.length})
        </h3>
        <button className="btn btn-primary" onClick={onAdd}>
          + Ajouter une piste
        </button>
      </div>

      {loading && <div className="muted">Chargement…</div>}

      {!loading && tracks.length === 0 && (
        <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
          Aucune piste. Ajoute la première musique de ce thème.
        </div>
      )}

      {!loading && tracks.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {tracks.map((t) => (
            <li
              key={t.id}
              onClick={() => onEdit(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                cursor: 'pointer',
                borderRadius: 8,
                background: 'var(--surface-2)',
                marginBottom: 6,
                opacity: t.is_active ? 1 : 0.55,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.title}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  ordre {t.sort_order}
                  {t.duration_ms !== null
                    ? ` · ${formatDuration(t.duration_ms)}`
                    : ''}
                </div>
              </div>
              {!t.is_active && (
                <span className="tag tag-retired">Inactif</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
