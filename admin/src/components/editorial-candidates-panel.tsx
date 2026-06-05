import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  EDITORIAL_CANDIDATE_CATEGORY_LABELS,
  type EditorialCandidate,
  type EditorialCandidateCategory,
  type EditorialSeed,
} from '../lib/types';

const CATEGORY_ORDER: EditorialCandidateCategory[] = ['book', 'review', 'sheet', 'feed'];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type Props = {
  onPromote: (seed: EditorialSeed) => void;
};

// Panneau « Candidats du mois » : appelle le RPC admin_editorial_candidates
// (4 sources classées sur le mois calendaire) et propose de promouvoir un
// candidat → pré-remplit le formulaire (type, cible, titre, couverture).
export function EditorialCandidatesPanel({ onPromote }: Props) {
  const [month, setMonth] = useState(currentMonth());
  const [candidates, setCandidates] = useState<EditorialCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_editorial_candidates', {
      p_month: `${month}-01`,
      p_limit: 8,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setCandidates((data ?? []) as EditorialCandidate[]);
  }

  return (
    <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 24px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
          }}>
          <h2 style={{ margin: 0 }}>Candidats du mois</h2>
          <input
            className="input"
            style={{ width: 'auto' }}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
          Classements calculés sur le mois calendaire. « Promouvoir » ouvre une
          publication pré-remplie (type, cible, titre, couverture) à compléter et
          publier.
        </div>

        {loading && <div className="muted">Chargement…</div>}
        {error && <div className="error">{error}</div>}

        {!loading &&
          !error &&
          CATEGORY_ORDER.map((cat) => {
            const rows = candidates.filter((c) => c.category === cat);
            return (
              <section key={cat} style={{ marginBottom: 20 }}>
                <h3
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    color: 'var(--ink-muted)',
                    marginBottom: 8,
                  }}>
                  {EDITORIAL_CANDIDATE_CATEGORY_LABELS[cat]}
                </h3>
                {rows.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Aucun candidat ce mois.
                  </div>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}>
                    {rows.map((c) => (
                      <CandidateRow
                        key={`${c.category}-${c.ref_id}`}
                        candidate={c}
                        onPromote={onPromote}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
      </div>
    </main>
  );
}

function CandidateRow({
  candidate: c,
  onPromote,
}: {
  candidate: EditorialCandidate;
  onPromote: (seed: EditorialSeed) => void;
}) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        border: '1px solid var(--line)',
        borderRadius: 8,
        background: 'var(--surface)',
      }}>
      {c.cover_url ? (
        <img
          src={c.cover_url}
          alt=""
          style={{ width: 38, height: 54, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 38,
            height: 54,
            borderRadius: 4,
            background: 'var(--surface-2)',
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
          {c.title}
        </div>
        {c.subtitle && (
          <div
            className="muted"
            style={{
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
            {c.subtitle}
          </div>
        )}
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {c.metric_value} {c.metric_label}
          {c.author_name ? ` · ${c.author_name}` : ''}
        </div>
      </div>
      <button
        className="btn btn-primary"
        style={{ flexShrink: 0 }}
        onClick={() =>
          onPromote({
            kind: c.kind,
            title: c.title,
            subtitle: c.subtitle,
            cover_url: c.cover_url,
            ref_kind: c.ref_kind,
            ref_id: c.ref_id,
            review_id: c.review_id,
          })
        }>
        Promouvoir
      </button>
    </li>
  );
}
