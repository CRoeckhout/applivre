import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ReadingSessionRow } from "../../lib/types";

type Props = { userId: string };

type SessionWithBook = ReadingSessionRow & {
  user_book: {
    book_isbn: string;
    book: { isbn: string; title: string } | null;
  } | null;
};

export function SessionsPanel({ userId }: Props) {
  const [sessions, setSessions] = useState<SessionWithBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("reading_sessions")
        .select(
          "*, user_book:user_books!inner(book_isbn,user_id,book:books(isbn,title))",
        )
        .eq("user_book.user_id", userId)
        .order("started_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setSessions((data ?? []) as SessionWithBook[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const stats = useMemo(() => {
    if (!sessions || sessions.length === 0)
      return { totalSec: 0, totalPages: 0, count: 0, avgSec: 0 };
    const totalSec = sessions.reduce((acc, s) => acc + s.duration_sec, 0);
    const totalPages = sessions.reduce((acc, s) => acc + s.pages_read, 0);
    return {
      totalSec,
      totalPages,
      count: sessions.length,
      avgSec: Math.round(totalSec / sessions.length),
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
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}>
        <StatTile label="Séances" value={stats.count} />
        <StatTile label="Temps total" value={formatDuration(stats.totalSec)} />
        <StatTile label="Pages lues" value={stats.totalPages} />
        <StatTile
          label="Durée moyenne"
          value={formatDuration(stats.avgSec)}
        />
      </div>

      <div style={{ overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <Th>Démarrée</Th>
              <Th>Livre</Th>
              <Th>Durée</Th>
              <Th>Pages</Th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                style={{ borderBottom: "1px solid var(--line)" }}>
                <Td>{new Date(s.started_at).toLocaleString()}</Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>
                    {s.user_book?.book?.title ?? "—"}
                  </div>
                  <div
                    className="muted"
                    style={{ fontSize: 11, fontFamily: "monospace" }}>
                    {s.user_book?.book_isbn}
                  </div>
                </Td>
                <Td>{formatDuration(s.duration_sec)}</Td>
                <Td>{s.pages_read}</Td>
              </tr>
            ))}
          </tbody>
        </table>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "6px 8px",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--ink-muted)",
        textTransform: "uppercase",
      }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "8px", verticalAlign: "top" }}>{children}</td>
  );
}
