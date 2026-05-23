import { useEffect, useMemo, useState } from "react";
import {
  getAdminUserSessions,
  type SessionWithBook,
} from "../../lib/admin-queries";

type Props = { userId: string };

// Grille partagée header/rows : caret(16) | date | livre(1fr) | durée | page.
// `auto` partout sauf le livre qui prend le reste — évite que les dates
// longues "23/05/2026 01:23:45" wrappent.
const GRID = "16px 160px 1fr 80px 100px";

export function SessionsPanel({ userId }: Props) {
  const [sessions, setSessions] = useState<SessionWithBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getAdminUserSessions(userId);
        if (cancelled) return;
        setSessions(data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const stats = useMemo(() => {
    if (!sessions || sessions.length === 0)
      return {
        totalSec: 0,
        totalPages: 0,
        count: 0,
        avgSec: 0,
        withNote: 0,
      };
    const totalSec = sessions.reduce((acc, s) => acc + s.duration_sec, 0);
    // `stopped_at_page` est une page absolue par session (cf. 0002).
    // Pages lues = max(stopped_at_page) par livre, sommé sur tous les
    // livres. Hypothèse : page de départ = 1, donc max == pages lues du
    // livre. Une relecture remontera artificiellement le compteur — accepté
    // pour V1, on dérouera par read_cycles si besoin.
    const maxByBook = new Map<string, number>();
    for (const s of sessions) {
      const cur = maxByBook.get(s.user_book_id) ?? 0;
      if (s.stopped_at_page > cur)
        maxByBook.set(s.user_book_id, s.stopped_at_page);
    }
    const totalPages = [...maxByBook.values()].reduce(
      (acc, p) => acc + p,
      0,
    );
    const withNote = sessions.reduce(
      (acc, s) => acc + (s.note && s.note.trim().length > 0 ? 1 : 0),
      0,
    );
    return {
      totalSec,
      totalPages,
      count: sessions.length,
      avgSec: Math.round(totalSec / sessions.length),
      withNote,
    };
  }, [sessions]);

  if (error) return <div className="error">Erreur : {error}</div>;
  if (!sessions) return <div className="muted">Chargement…</div>;
  if (sessions.length === 0)
    return <div className="muted">Aucune séance de lecture enregistrée.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 8,
        }}>
        <StatTile label="Séances" value={stats.count} />
        <StatTile label="Temps total" value={formatDuration(stats.totalSec)} />
        <StatTile label="Pages lues" value={stats.totalPages} />
        <StatTile
          label="Durée moyenne"
          value={formatDuration(stats.avgSec)}
        />
        <StatTile label="Avec note" value={stats.withNote} />
      </div>

      <style>{`
        .sessions-panel-row > summary { list-style: none; cursor: pointer; }
        .sessions-panel-row > summary::-webkit-details-marker { display: none; }
        .sessions-panel-row .caret { transition: transform 220ms ease; }
        .sessions-panel-row[open] .caret { transform: rotate(90deg); }
        .sessions-panel-row:hover { background: var(--surface-2); }

        /* Animation déroulé/enroulé du body via interpolate-size + ::details-content.
           Chrome 131+, Safari 18.4+. Sur navigateurs sans support, fallback
           gracieux : toggle natif instantané, juste sans transition. */
        .sessions-panel-row {
          interpolate-size: allow-keywords;
        }
        .sessions-panel-row::details-content {
          block-size: 0;
          overflow: clip;
          opacity: 0;
          transition: block-size 240ms ease, opacity 200ms ease, content-visibility 240ms allow-discrete;
        }
        .sessions-panel-row[open]::details-content {
          block-size: auto;
          opacity: 1;
        }
      `}</style>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 8,
          overflow: "hidden",
          fontSize: 13,
        }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            gap: 8,
            alignItems: "center",
            background: "var(--surface-2)",
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--ink-muted)",
            textTransform: "uppercase",
          }}>
          <div />
          <div>Démarrée</div>
          <div>Livre</div>
          <div>Durée</div>
          <div>Page atteinte</div>
        </div>

        {sessions.map((s) => {
          const hasNote = !!(s.note && s.note.trim().length > 0);
          const rowContent = (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 8,
                alignItems: "center",
                padding: "8px 10px",
              }}>
              <span
                className="caret"
                style={{
                  display: "inline-block",
                  width: 16,
                  textAlign: "center",
                  color: hasNote ? "var(--ink)" : "transparent",
                  userSelect: "none",
                }}
                aria-hidden>
                ▶
              </span>
              <div>{new Date(s.started_at).toLocaleString()}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 44,
                    borderRadius: 4,
                    background: "var(--surface-3)",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}>
                  {s.user_book?.book?.cover_url ? (
                    <img
                      src={s.user_book.book.cover_url}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {s.user_book?.book?.title ?? "—"}
                  </div>
                  <div
                    className="muted"
                    style={{ fontSize: 11, fontFamily: "monospace" }}>
                    {s.user_book?.book_isbn}
                  </div>
                </div>
              </div>
              <div>{formatDuration(s.duration_sec)}</div>
              <div>{s.stopped_at_page}</div>
            </div>
          );

          if (hasNote) {
            return (
              <details
                key={s.id}
                className="sessions-panel-row"
                style={{ borderTop: "1px solid var(--line)" }}>
                <summary>{rowContent}</summary>
                <div
                  style={{
                    padding: "8px 10px 14px 34px",
                    whiteSpace: "pre-wrap",
                    fontSize: 13,
                    color: "var(--ink)",
                    background: "var(--surface)",
                    borderTop: "1px dashed var(--line)",
                  }}>
                  {s.note}
                </div>
              </details>
            );
          }
          return (
            <div
              key={s.id}
              className="sessions-panel-row"
              style={{ borderTop: "1px solid var(--line)" }}>
              {rowContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "8px 10px",
        textAlign: "center",
      }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
      <div className="muted" style={{ fontSize: 11 }}>
        {label}
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (sec <= 0) return "0 min";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m} min`;
}
