import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  READING_STATUSES,
  READING_STATUS_LABELS,
  type BookCatalogRow,
  type ReadingStatus,
  type UserBookRow,
} from "../../lib/types";

type Props = { userId: string };

type BookRow = UserBookRow & { book?: Pick<BookCatalogRow, "isbn" | "title" | "authors" | "cover_url"> };

const STATUS_COLORS: Record<ReadingStatus, string> = {
  wishlist: "#a78bfa",
  to_read: "#94a3b8",
  reading: "#60a5fa",
  paused: "#f59e0b",
  read: "#34d399",
  abandoned: "#ef4444",
};

export function BooksPanel({ userId }: Props) {
  const [books, setBooks] = useState<BookRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | "all">(
    "all",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("user_books")
        .select("*, book:books(isbn,title,authors,cover_url)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setBooks((data ?? []) as BookRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const filtered = useMemo(() => {
    if (!books) return null;
    if (statusFilter === "all") return books;
    return books.filter((b) => b.status === statusFilter);
  }, [books, statusFilter]);

  const counts = useMemo(() => {
    const acc: Record<ReadingStatus, number> = {
      wishlist: 0,
      to_read: 0,
      reading: 0,
      paused: 0,
      read: 0,
      abandoned: 0,
    };
    for (const b of books ?? []) acc[b.status]++;
    return acc;
  }, [books]);

  if (error) return <div className="error">Erreur : {error}</div>;
  if (!books) return <div className="muted">Chargement…</div>;
  if (books.length === 0)
    return <div className="muted">Aucun livre dans l'étagère.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <FilterPill
          label={`Tous · ${books.length}`}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        {READING_STATUSES.map((s) => (
          <FilterPill
            key={s}
            label={`${READING_STATUS_LABELS[s]} · ${counts[s]}`}
            color={STATUS_COLORS[s]}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          />
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <Th>Couv.</Th>
              <Th>Titre / ISBN</Th>
              <Th>Statut</Th>
              <Th>Note</Th>
              <Th>Commencé</Th>
              <Th>Terminé</Th>
              <Th>Genres</Th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((b) => (
              <tr
                key={b.id}
                style={{ borderBottom: "1px solid var(--line)" }}>
                <Td>
                  <div
                    style={{
                      width: 32,
                      height: 44,
                      borderRadius: 4,
                      background: "var(--surface-3)",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                    {b.book?.cover_url ? (
                      <img
                        src={b.book.cover_url}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span
                        className="muted"
                        style={{ fontSize: 10 }}>
                        ?
                      </span>
                    )}
                  </div>
                </Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>
                    {b.book?.title ?? "(sans titre)"}
                    {b.favorite ? (
                      <span title="Favori" style={{ marginLeft: 6 }}>
                        ★
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="muted"
                    style={{ fontSize: 11, fontFamily: "monospace" }}>
                    {b.book_isbn}
                  </div>
                  {b.book?.authors && b.book.authors.length > 0 ? (
                    <div className="muted" style={{ fontSize: 11 }}>
                      {b.book.authors.join(", ")}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <StatusPill status={b.status} />
                  {b.status === "paused" && b.paused_page !== null ? (
                    <div className="muted" style={{ fontSize: 11 }}>
                      page {b.paused_page}
                    </div>
                  ) : null}
                </Td>
                <Td>{b.rating ? "★".repeat(b.rating) : "—"}</Td>
                <Td>
                  {b.started_at
                    ? new Date(b.started_at).toLocaleDateString()
                    : "—"}
                </Td>
                <Td>
                  {b.finished_at
                    ? new Date(b.finished_at).toLocaleDateString()
                    : "—"}
                </Td>
                <Td>
                  {b.genres.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                      }}>
                      {b.genres.map((g) => (
                        <span
                          key={g}
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 999,
                            background: "var(--surface-2)",
                          }}>
                          {g}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ReadingStatus }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: STATUS_COLORS[status],
        color: "white",
      }}>
      {READING_STATUS_LABELS[status]}
    </span>
  );
}

function FilterPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        border: "1px solid",
        borderColor: active ? color ?? "var(--accent)" : "var(--line)",
        background: active ? color ?? "var(--accent)" : "var(--surface)",
        color: active ? "white" : "var(--ink)",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
      }}>
      {label}
    </button>
  );
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
