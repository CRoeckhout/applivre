import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { BookLoanRow } from "../../lib/types";

type Props = { userId: string };

type LoanWithBook = BookLoanRow & {
  user_book: {
    book_isbn: string;
    book: { isbn: string; title: string } | null;
  } | null;
};

export function LoansPanel({ userId }: Props) {
  const [loans, setLoans] = useState<LoanWithBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("book_loans")
        .select(
          "*, user_book:user_books!inner(book_isbn,user_id,book:books(isbn,title))",
        )
        .eq("user_book.user_id", userId)
        .order("date_out", { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setLoans((data ?? []) as LoanWithBook[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const ongoing = useMemo(
    () => (loans ?? []).filter((l) => l.date_back === null),
    [loans],
  );
  const past = useMemo(
    () => (loans ?? []).filter((l) => l.date_back !== null),
    [loans],
  );

  if (error) return <div className="error">Erreur : {error}</div>;
  if (!loans) return <div className="muted">Chargement…</div>;
  if (loans.length === 0)
    return <div className="muted">Aucun prêt / emprunt.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section
        title={`En cours · ${ongoing.length}`}
        loans={ongoing}
        emptyLabel="Aucun prêt en cours."
      />
      <Section
        title={`Historique · ${past.length}`}
        loans={past}
        emptyLabel="Aucun prêt terminé."
      />
    </div>
  );
}

function Section({
  title,
  loans,
  emptyLabel,
}: {
  title: string;
  loans: LoanWithBook[];
  emptyLabel: string;
}) {
  return (
    <div>
      <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>{title}</h3>
      {loans.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {emptyLabel}
        </div>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <Th>Livre</Th>
              <Th>Sens</Th>
              <Th>Contact</Th>
              <Th>Sortie</Th>
              <Th>Retour</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr
                key={l.id}
                style={{ borderBottom: "1px solid var(--line)" }}>
                <Td>
                  <div style={{ fontWeight: 600 }}>
                    {l.user_book?.book?.title ?? "—"}
                  </div>
                  <div
                    className="muted"
                    style={{ fontSize: 11, fontFamily: "monospace" }}>
                    {l.user_book?.book_isbn}
                  </div>
                </Td>
                <Td>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 8px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "white",
                      background:
                        l.direction === "lent" ? "#3b82f6" : "#10b981",
                    }}>
                    {l.direction === "lent" ? "Prêté" : "Emprunté"}
                  </span>
                </Td>
                <Td>{l.contact_name}</Td>
                <Td>
                  {new Date(l.date_out).toLocaleDateString()}
                </Td>
                <Td>
                  {l.date_back
                    ? new Date(l.date_back).toLocaleDateString()
                    : "—"}
                </Td>
                <Td>
                  {l.note ? (
                    <span
                      style={{
                        fontSize: 11,
                        whiteSpace: "pre-wrap",
                      }}>
                      {l.note}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
