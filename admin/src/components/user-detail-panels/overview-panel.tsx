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
// ajouts de livres dans user_books (qui ne créent pas d'entrée feed) et les
// commentaires postés (qui ne sont pas non plus dans le feed). L'admin a
// besoin de voir tout ça pour comprendre l'activité réelle de l'user, pas
// seulement les actions partagées publiquement.
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
    }
  | {
      kind: "comment";
      date: string;
      id: string;
      body: string;
      targetKind: string;
      targetLabel: string | null;
      targetAuthor: TargetAuthor | null;
      isReply: boolean;
      deleted: boolean;
    };

// Auteur de la publication commentée (rendu en lien cliquable vers le
// profil admin de l'auteur). `null` quand le target n'a pas d'auteur
// déterministe (ex: réponse à un commentaire imbriqué qu'on n'a pas
// résolu deux niveaux plus haut).
type TargetAuthor = {
  userId: string;
  label: string;
};

type AddedBookRow = {
  id: string;
  book_isbn: string;
  status: ReadingStatus;
  created_at: string;
  book: { isbn: string; title: string } | null;
};

type CommentEntry = {
  id: string;
  target_kind: string;
  target_id: string;
  parent_id: string | null;
  body: string;
  deleted_at: string | null;
  created_at: string;
};

// Map (target_kind, target_id) -> label affichable + auteur cliquable.
// Construit en N requêtes IN() (max ~5, une par kind + un batch profils)
// pour éviter de charger la BDD avec des joins croisés.
type TargetInfo = { label: string; author: TargetAuthor | null };
type TargetInfoMap = Map<string, TargetInfo>;
const targetLabelKey = (kind: string, id: string) => `${kind}:${id}`;

const LIMIT = 12;

export function OverviewPanel({ userId }: Props) {
  const [feedEntries, setFeedEntries] = useState<SocialFeedEntryRow[] | null>(
    null,
  );
  const [addedBooks, setAddedBooks] = useState<AddedBookRow[] | null>(null);
  const [comments, setComments] = useState<CommentEntry[] | null>(null);
  const [targetInfo, setTargetInfo] = useState<TargetInfoMap>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFeedEntries(null);
    setAddedBooks(null);
    setComments(null);
    setTargetInfo(new Map());
    setError(null);

    void (async () => {
      const [feedRes, booksRes, commentsRes] = await Promise.all([
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
        supabase
          .from("social_comments")
          .select("id,target_kind,target_id,parent_id,body,deleted_at,created_at")
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
      if (commentsRes.error) {
        setError(commentsRes.error.message);
        return;
      }
      const commentRows = (commentsRes.data ?? []) as CommentEntry[];
      setFeedEntries((feedRes.data ?? []) as SocialFeedEntryRow[]);
      // PostgREST type le `book:books(...)` comme array (FK générique). On
      // sait que c'est 1:1 (FK unique), donc cast via unknown.
      setAddedBooks((booksRes.data ?? []) as unknown as AddedBookRow[]);
      setComments(commentRows);

      const info = await fetchCommentTargetInfo(commentRows);
      if (cancelled) return;
      setTargetInfo(info);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const merged: Activity[] | null = useMemo(() => {
    if (!feedEntries || !addedBooks || !comments) return null;
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
      ...comments.map<Activity>((c) => {
        const info =
          targetInfo.get(targetLabelKey(c.target_kind, c.target_id)) ?? null;
        return {
          kind: "comment",
          date: c.created_at,
          id: `comment-${c.id}`,
          body: c.body,
          targetKind: c.target_kind,
          targetLabel: info?.label ?? null,
          targetAuthor: info?.author ?? null,
          isReply: c.parent_id !== null,
          deleted: c.deleted_at !== null,
        };
      }),
    ];
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return all.slice(0, LIMIT);
  }, [feedEntries, addedBooks, comments, targetInfo]);

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
              ) : a.kind === "book_added" ? (
                <BookAddedRow
                  status={a.status}
                  bookTitle={a.bookTitle}
                  bookIsbn={a.bookIsbn}
                />
              ) : (
                <CommentRow
                  body={a.body}
                  targetKind={a.targetKind}
                  targetLabel={a.targetLabel}
                  targetAuthor={a.targetAuthor}
                  isReply={a.isReply}
                  deleted={a.deleted}
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

const COMMENT_TARGET_LABELS: Record<string, string> = {
  sheet: "une fiche",
  review: "un avis",
  comment: "un commentaire",
  bingo: "un bingo",
  book: "un livre",
  feed_entry: "une activité",
};

function CommentRow({
  body,
  targetKind,
  targetLabel,
  targetAuthor,
  isReply,
  deleted,
}: {
  body: string;
  targetKind: string;
  targetLabel: string | null;
  targetAuthor: TargetAuthor | null;
  isReply: boolean;
  deleted: boolean;
}) {
  const kindNoun = COMMENT_TARGET_LABELS[targetKind] ?? targetKind;
  const verb = isReply
    ? `a répondu à ${COMMENT_TARGET_LABELS.comment}`
    : `a commenté ${kindNoun}`;
  return (
    <>
      <div style={{ fontWeight: 600 }}>
        {verb}
        {targetAuthor ? (
          <>
            <span
              className="muted"
              style={{ fontWeight: 400, marginLeft: 6 }}>
              de
            </span>{" "}
            <a
              href={`#/users/${encodeURIComponent(targetAuthor.userId)}`}
              style={{ fontWeight: 600 }}>
              {targetAuthor.label}
            </a>
          </>
        ) : null}
        {targetLabel ? (
          <span
            className="muted"
            style={{ fontWeight: 400, marginLeft: 6 }}>
            — {targetLabel}
          </span>
        ) : null}
        {deleted ? (
          <span
            className="muted"
            style={{ fontWeight: 400, marginLeft: 6 }}>
            (supprimé)
          </span>
        ) : null}
      </div>
      <div
        className="muted"
        style={{
          fontSize: 12,
          fontStyle: "italic",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          opacity: deleted ? 0.6 : 1,
        }}
        title={body}>
        « {body} »
      </div>
    </>
  );
}

// Résout label + auteur pour chaque commentaire, en regroupant par
// target_kind. Une requête IN() par kind (sheet/review/comment/bingo/
// feed_entry) puis un dernier batch sur `profiles` pour hydrater tous les
// auteurs en un coup. Charge BDD négligeable, pas d'edge function.
async function fetchCommentTargetInfo(
  rows: CommentEntry[],
): Promise<TargetInfoMap> {
  const result: TargetInfoMap = new Map();
  if (rows.length === 0) return result;

  const idsByKind = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!idsByKind.has(r.target_kind)) idsByKind.set(r.target_kind, new Set());
    idsByKind.get(r.target_kind)!.add(r.target_id);
  }

  // Premier passage : on collecte (label, authorUserId) par target. Les
  // labels sont posés tout de suite ; les profils sont hydratés en un
  // seul batch après.
  const pending: { key: string; label: string; authorUserId: string | null }[] =
    [];

  const tasks: Promise<void>[] = [];

  const sheetIds = idsByKind.get("sheet");
  if (sheetIds && sheetIds.size > 0) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("reading_sheets")
          .select(
            "id,user_book:user_books(user_id,book:books(title))",
          )
          .in("id", Array.from(sheetIds));
        type Row = {
          id: string;
          user_book: {
            user_id: string;
            book: { title: string } | null;
          } | null;
        };
        for (const row of (data ?? []) as unknown as Row[]) {
          const title = row.user_book?.book?.title ?? "(sans titre)";
          pending.push({
            key: targetLabelKey("sheet", row.id),
            label: title,
            authorUserId: row.user_book?.user_id ?? null,
          });
        }
      })(),
    );
  }

  const reviewIds = idsByKind.get("review");
  if (reviewIds && reviewIds.size > 0) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("book_reviews")
          .select("id,user_id,book:books(title)")
          .in("id", Array.from(reviewIds));
        type Row = {
          id: string;
          user_id: string;
          book: { title: string } | null;
        };
        for (const row of (data ?? []) as unknown as Row[]) {
          const title = row.book?.title ?? "(sans titre)";
          pending.push({
            key: targetLabelKey("review", row.id),
            label: title,
            authorUserId: row.user_id,
          });
        }
      })(),
    );
  }

  const parentIds = idsByKind.get("comment");
  if (parentIds && parentIds.size > 0) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("social_comments")
          .select("id,user_id,body")
          .in("id", Array.from(parentIds));
        for (const row of (data ?? []) as {
          id: string;
          user_id: string;
          body: string;
        }[]) {
          pending.push({
            key: targetLabelKey("comment", row.id),
            label: excerpt(row.body, 60),
            authorUserId: row.user_id,
          });
        }
      })(),
    );
  }

  const bingoIds = idsByKind.get("bingo");
  if (bingoIds && bingoIds.size > 0) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("bingos")
          .select("id,user_id,title")
          .in("id", Array.from(bingoIds));
        for (const row of (data ?? []) as {
          id: string;
          user_id: string;
          title: string;
        }[]) {
          pending.push({
            key: targetLabelKey("bingo", row.id),
            label: row.title,
            authorUserId: row.user_id,
          });
        }
      })(),
    );
  }

  const feedIds = idsByKind.get("feed_entry");
  if (feedIds && feedIds.size > 0) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("social_feed_entries")
          .select("id,actor_id,verb,meta")
          .in("id", Array.from(feedIds));
        type Row = {
          id: string;
          actor_id: string;
          verb: string;
          meta: Record<string, unknown> | null;
        };
        const feedRows = (data ?? []) as Row[];
        // Hydrate les book_isbn présents dans meta en un seul IN()
        // pour pouvoir afficher le titre du livre concerné.
        const isbns = new Set<string>();
        for (const r of feedRows) {
          const isbn = r.meta?.["book_isbn"];
          if (typeof isbn === "string" && isbn.length > 0) isbns.add(isbn);
        }
        const titleByIsbn = new Map<string, string>();
        if (isbns.size > 0) {
          const { data: books } = await supabase
            .from("books")
            .select("isbn,title")
            .in("isbn", Array.from(isbns));
          for (const b of (books ?? []) as { isbn: string; title: string }[]) {
            titleByIsbn.set(b.isbn, b.title);
          }
        }
        for (const r of feedRows) {
          const verbLabel = VERB_LABELS[r.verb] ?? r.verb;
          const isbn = r.meta?.["book_isbn"];
          const title =
            typeof isbn === "string" ? titleByIsbn.get(isbn) : undefined;
          pending.push({
            key: targetLabelKey("feed_entry", r.id),
            label: title ? `${verbLabel} — ${title}` : verbLabel,
            authorUserId: r.actor_id,
          });
        }
      })(),
    );
  }

  await Promise.all(tasks);

  // Batch final : profils des auteurs (un seul IN() sur profiles, RLS admin
  // déjà en place via "profiles admin select" cf. migration 0059).
  const authorIds = new Set<string>();
  for (const p of pending) {
    if (p.authorUserId) authorIds.add(p.authorUserId);
  }
  const authorById = new Map<string, TargetAuthor>();
  if (authorIds.size > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id,username,display_name")
      .in("id", Array.from(authorIds));
    for (const row of (data ?? []) as {
      id: string;
      username: string | null;
      display_name: string | null;
    }[]) {
      authorById.set(row.id, {
        userId: row.id,
        label: row.display_name ?? row.username ?? "(profil sans nom)",
      });
    }
  }

  for (const p of pending) {
    result.set(p.key, {
      label: p.label,
      author: p.authorUserId ? authorById.get(p.authorUserId) ?? null : null,
    });
  }

  return result;
}

function excerpt(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
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
