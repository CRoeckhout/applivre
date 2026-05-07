import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ReadingSheetRow } from "../../lib/types";

type Props = { userId: string };

type SheetWithBook = ReadingSheetRow & {
  user_book: {
    id: string;
    book_isbn: string;
    book: { isbn: string; title: string; cover_url: string | null } | null;
  } | null;
};

export function SheetsPanel({ userId }: Props) {
  const [sheets, setSheets] = useState<SheetWithBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSheet, setOpenSheet] = useState<SheetWithBook | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Pas de FK directe sheet→user. On filtre via user_book.user_id.
      const { data, error } = await supabase
        .from("reading_sheets")
        .select(
          "*, user_book:user_books!inner(id,book_isbn,user_id,book:books(isbn,title,cover_url))",
        )
        .eq("user_book.user_id", userId)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setSheets((data ?? []) as SheetWithBook[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) return <div className="error">Erreur : {error}</div>;
  if (!sheets) return <div className="muted">Chargement…</div>;
  if (sheets.length === 0)
    return <div className="muted">Aucune fiche de lecture.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {sheets.length} fiche{sheets.length > 1 ? "s" : ""} de lecture
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}>
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            <Th>Couv.</Th>
            <Th>Livre</Th>
            <Th>Public</Th>
            <Th>Mis à jour</Th>
            <Th> </Th>
          </tr>
        </thead>
        <tbody>
          {sheets.map((s) => (
            <tr
              key={s.id}
              style={{ borderBottom: "1px solid var(--line)" }}>
              <Td>
                <div
                  style={{
                    width: 32,
                    height: 44,
                    borderRadius: 4,
                    background: "var(--surface-3)",
                    overflow: "hidden",
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
              </Td>
              <Td>
                <div style={{ fontWeight: 600 }}>
                  {s.user_book?.book?.title ?? "(sans titre)"}
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 11, fontFamily: "monospace" }}>
                  {s.user_book?.book_isbn}
                </div>
              </Td>
              <Td>{s.is_public ? "Oui" : "Non"}</Td>
              <Td>{new Date(s.updated_at).toLocaleString()}</Td>
              <Td>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: "4px 10px" }}
                  onClick={() => setOpenSheet(s)}>
                  Voir contenu
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      {openSheet ? (
        <SheetContentModal
          sheet={openSheet}
          onClose={() => setOpenSheet(null)}
        />
      ) : null}
    </div>
  );
}

function SheetContentModal({
  sheet,
  onClose,
}: {
  sheet: SheetWithBook;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          padding: 16,
          maxWidth: 720,
          maxHeight: "80vh",
          overflow: "auto",
          width: "90%",
        }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>
            Fiche · {sheet.user_book?.book?.title ?? sheet.user_book?.book_isbn}
          </h3>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              cursor: "pointer",
              color: "var(--ink-muted)",
            }}>
            ×
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            background: "var(--surface-2)",
            padding: 12,
            borderRadius: 6,
            fontSize: 11,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
          {JSON.stringify(sheet.content, null, 2)}
        </pre>
      </div>
    </div>
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
