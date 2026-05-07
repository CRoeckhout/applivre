import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  READING_STATUS_LABELS,
  type ReadingStatus,
  type SocialFeedEntryRow,
} from "../../lib/types";

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

// Activité unifiée : on merge le social_feed (verbes explicites) avec les
// ajouts de livres dans user_books (qui ne créent pas d'entrée feed).
// L'admin a besoin de voir ces ajouts pour comprendre l'activité réelle de
// l'user, pas seulement les actions partagées publiquement.
type Activity =
  | {
      kind: "feed";
      date: string;
      id: string;
      verb: string;
      target_kind: string | null;
      meta: Record<string, unknown>;
      visibility: "public" | "followers" | "private";
    }
  | {
      kind: "book_added";
      date: string;
      id: string;
      bookTitle: string | null;
      bookIsbn: string;
      status: ReadingStatus;
    };

type AddedBookRow = {
  id: string;
  book_isbn: string;
  status: ReadingStatus;
  created_at: string;
  book: { isbn: string; title: string } | null;
};

const LIMIT = 12;

export function OverviewPanel({ userId }: Props) {
  const [feedEntries, setFeedEntries] = useState<SocialFeedEntryRow[] | null>(
    null,
  );
  const [addedBooks, setAddedBooks] = useState<AddedBookRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFeedEntries(null);
    setAddedBooks(null);
    setError(null);

    void (async () => {
      const [feedRes, booksRes] = await Promise.all([
        supabase
          .from("social_feed_entries")
          .select("*")
          .eq("actor_id", userId)
          .order("created_at", { ascending: false })
          .limit(LIMIT),
        supabase
          .from("user_books")
          .select("id,book_isbn,status,created_at,book:books(isbn,title)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(LIMIT),
      ]);
      if (cancelled) return;
      if (feedRes.error) {
        setError(feedRes.error.message);
        return;
      }
      if (booksRes.error) {
        setError(booksRes.error.message);
        return;
      }
      setFeedEntries((feedRes.data ?? []) as SocialFeedEntryRow[]);
      // PostgREST type le `book:books(...)` comme array (FK générique). On
      // sait que c'est 1:1 (FK unique), donc cast via unknown.
      setAddedBooks((booksRes.data ?? []) as unknown as AddedBookRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const merged: Activity[] | null = useMemo(() => {
    if (!feedEntries || !addedBooks) return null;
    const all: Activity[] = [
      ...feedEntries.map<Activity>((e) => ({
        kind: "feed",
        date: e.created_at,
        id: `feed-${e.id}`,
        verb: e.verb,
        target_kind: e.target_kind,
        meta: e.meta,
        visibility: e.visibility,
      })),
      ...addedBooks.map<Activity>((b) => ({
        kind: "book_added",
        date: b.created_at,
        id: `book-${b.id}`,
        bookTitle: b.book?.title ?? null,
        bookIsbn: b.book_isbn,
        status: b.status,
      })),
    ];
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return all.slice(0, LIMIT);
  }, [feedEntries, addedBooks]);

  if (error) {
    return <div className="error">Erreur : {error}</div>;
  }
  if (!merged) {
    return <div className="muted">Chargement…</div>;
  }
  if (merged.length === 0) {
    return <div className="muted">Aucune activité enregistrée.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
        Activités récentes
      </h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {merged.map((a) => (
          <li
            key={a.id}
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
              {a.kind === "feed" ? (
                <FeedRow
                  verb={a.verb}
                  target_kind={a.target_kind}
                  meta={a.meta}
                />
              ) : (
                <BookAddedRow
                  status={a.status}
                  bookTitle={a.bookTitle}
                  bookIsbn={a.bookIsbn}
                />
              )}
            </div>
            <div
              className="muted"
              style={{ fontSize: 11, whiteSpace: "nowrap" }}>
              {a.kind === "feed" ? (
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "var(--surface-2)",
                    marginRight: 6,
                  }}>
                  {a.visibility}
                </span>
              ) : null}
              {new Date(a.date).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedRow({
  verb,
  target_kind,
  meta,
}: {
  verb: string;
  target_kind: string | null;
  meta: Record<string, unknown>;
}) {
  const hasMeta = Object.keys(meta ?? {}).length > 0;
  return (
    <>
      <div style={{ fontWeight: 600 }}>
        {VERB_LABELS[verb] ?? verb}
        {target_kind ? (
          <span
            className="muted"
            style={{ fontWeight: 400, marginLeft: 6 }}>
            ({target_kind})
          </span>
        ) : null}
      </div>
      {hasMeta ? (
        <div
          className="muted"
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={JSON.stringify(meta)}>
          {JSON.stringify(meta)}
        </div>
      ) : null}
    </>
  );
}

function BookAddedRow({
  status,
  bookTitle,
  bookIsbn,
}: {
  status: ReadingStatus;
  bookTitle: string | null;
  bookIsbn: string;
}) {
  return (
    <>
      <div style={{ fontWeight: 600 }}>
        a ajouté un livre à sa bibliothèque
        <span
          className="muted"
          style={{ fontWeight: 400, marginLeft: 6 }}>
          ({READING_STATUS_LABELS[status]})
        </span>
      </div>
      <div
        className="muted"
        style={{
          fontSize: 11,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
        <strong>{bookTitle ?? "(sans titre)"}</strong>
        <span style={{ fontFamily: "monospace", marginLeft: 6 }}>
          {bookIsbn}
        </span>
      </div>
    </>
  );
}
