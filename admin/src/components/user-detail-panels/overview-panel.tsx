import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { SocialFeedEntryRow } from "../../lib/types";

type Props = {
  userId: string;
};

const VERB_LABELS: Record<string, string> = {
  finished_reading: "a terminé un livre",
  posted_review: "a publié un avis",
  shared_sheet: "a partagé une fiche",
  won_bingo: "a gagné un bingo",
  reposted_entry: "a reposté une activité",
  followed_user: "a suivi un utilisateur",
};

// 6 dernières activités du user. RLS admin SELECT (cf. 0059) — bypass la
// visibility classique : l'admin voit tout (public/followers/private).
export function OverviewPanel({ userId }: Props) {
  const [entries, setEntries] = useState<SocialFeedEntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("social_feed_entries")
        .select("*")
        .eq("actor_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setEntries((data ?? []) as SocialFeedEntryRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) {
    return <div className="error">Erreur : {error}</div>;
  }
  if (!entries) {
    return <div className="muted">Chargement…</div>;
  }
  if (entries.length === 0) {
    return <div className="muted">Aucune activité enregistrée.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
        Activités récentes
      </h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {entries.map((e) => (
          <li
            key={e.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              padding: "8px 0",
              borderBottom: "1px solid var(--line)",
              gap: 12,
              fontSize: 13,
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {VERB_LABELS[e.verb] ?? e.verb}
                {e.target_kind ? (
                  <span
                    className="muted"
                    style={{ fontWeight: 400, marginLeft: 6 }}>
                    ({e.target_kind})
                  </span>
                ) : null}
              </div>
              {Object.keys(e.meta ?? {}).length > 0 ? (
                <div
                  className="muted"
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={JSON.stringify(e.meta)}>
                  {JSON.stringify(e.meta)}
                </div>
              ) : null}
            </div>
            <div
              className="muted"
              style={{ fontSize: 11, whiteSpace: "nowrap" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--surface-2)",
                  marginRight: 6,
                }}>
                {e.visibility}
              </span>
              {new Date(e.created_at).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
