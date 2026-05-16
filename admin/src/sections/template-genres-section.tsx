import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// CRUD basique des genres de templates de fiches. Liste figée éditable :
// l'app les fetch et les affiche en chips dans le drawer recherche et
// l'éditeur de template. Slugs immutables une fois créés (référencés par
// `reading_sheets_templates.genres[]`), label/ordre/actif éditables.

type Row = {
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

export function TemplateGenresSection({ itemId: _itemId, onItemChange: _onItemChange }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftSlug, setDraftSlug] = useState('');
  const [draftLabel, setDraftLabel] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from('reading_sheets_template_genres')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  }

  async function createGenre() {
    const slug = draftSlug.trim().toLowerCase();
    const label = draftLabel.trim();
    if (!slug || !label) return;
    if (!/^[a-z0-9-]+$/.test(slug)) {
      alert('Le slug ne peut contenir que lettres minuscules, chiffres et tirets.');
      return;
    }
    const nextOrder = (rows[rows.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase
      .from('reading_sheets_template_genres')
      .insert({ slug, label, sort_order: nextOrder, is_active: true });
    if (error) {
      alert(`Erreur: ${error.message}`);
      return;
    }
    setDraftSlug('');
    setDraftLabel('');
    void load();
  }

  async function updateGenre(slug: string, patch: Partial<Row>) {
    const { error } = await supabase
      .from('reading_sheets_template_genres')
      .update(patch)
      .eq('slug', slug);
    if (error) {
      alert(`Erreur: ${error.message}`);
      return;
    }
    void load();
  }

  async function deleteGenre(slug: string) {
    if (!confirm(`Supprimer le genre "${slug}" ? Les templates qui le référencent garderont la valeur dans leur tableau mais ne matcheront plus en filtre.`)) return;
    const { error } = await supabase
      .from('reading_sheets_template_genres')
      .delete()
      .eq('slug', slug);
    if (error) {
      alert(`Erreur: ${error.message}`);
      return;
    }
    void load();
  }

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <h2 style={{ margin: 0, marginBottom: 4 }}>Genres de templates</h2>
      <p style={{ color: '#888', marginTop: 0 }}>
        Liste affichée dans le drawer de recherche et l’éditeur de template côté app.
        Le slug est l’identifiant stable — ne le change pas après création (utilisé en
        référence dans <code>reading_sheets_templates.genres</code>).
      </p>

      {loadError && (
        <div style={{ background: '#fee', padding: 12, marginBottom: 12, borderRadius: 6 }}>
          Erreur de chargement: {loadError}
        </div>
      )}

      <div style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Nouveau genre</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="slug (ex. fantasy)"
            value={draftSlug}
            onChange={(e) => setDraftSlug(e.target.value)}
            style={{ padding: '6px 10px', minWidth: 200 }}
          />
          <input
            placeholder="Label affiché (ex. Fantaisie)"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            style={{ padding: '6px 10px', minWidth: 240 }}
          />
          <button onClick={createGenre}>+ Ajouter</button>
        </div>
      </div>

      <table style={{ marginTop: 24, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>Slug</th>
            <th style={{ padding: 8 }}>Label</th>
            <th style={{ padding: 8, width: 100 }}>Ordre</th>
            <th style={{ padding: 8, width: 80 }}>Actif</th>
            <th style={{ padding: 8, width: 100 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8, fontFamily: 'monospace' }}>{r.slug}</td>
              <td style={{ padding: 8 }}>
                <input
                  defaultValue={r.label}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== r.label) updateGenre(r.slug, { label: next });
                  }}
                  style={{ padding: '4px 8px', width: '100%' }}
                />
              </td>
              <td style={{ padding: 8 }}>
                <input
                  type="number"
                  defaultValue={r.sort_order}
                  onBlur={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (!Number.isNaN(next) && next !== r.sort_order) {
                      updateGenre(r.slug, { sort_order: next });
                    }
                  }}
                  style={{ padding: '4px 8px', width: 70 }}
                />
              </td>
              <td style={{ padding: 8 }}>
                <input
                  type="checkbox"
                  checked={r.is_active}
                  onChange={(e) => updateGenre(r.slug, { is_active: e.target.checked })}
                />
              </td>
              <td style={{ padding: 8 }}>
                <button onClick={() => deleteGenre(r.slug)} style={{ color: '#c8322a' }}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#888' }}>
                Aucun genre. Ajoute-en un avec le formulaire ci-dessus.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
