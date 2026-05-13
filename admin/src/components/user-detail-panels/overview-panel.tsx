import { useEffect, useMemo, useState } from "react";
import {
  getAdminUserOverview,
  type AdminUserOverview,
  type OverviewAddedBook,
  type OverviewComment,
  type OverviewTargetInfo,
} from "../../lib/admin-queries";
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

const targetLabelKey = (kind: string, id: string) => `${kind}:${id}`;

const LIMIT = 12;

export function OverviewPanel({ userId }: Props) {
  const [data, setData] = useState<AdminUserOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    void (async () => {
      try {
        const res = await getAdminUserOverview(userId);
        if (cancelled) return;
        setData(res);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const merged: Activity[] | null = useMemo(() => {
    if (!data) return null;
    return mergeActivities(
      data.feed,
      data.added_books,
      data.comments,
      data.target_info,
    );
  }, [data]);

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

function mergeActivities(
  feed: SocialFeedEntryRow[],
  addedBooks: OverviewAddedBook[],
  comments: OverviewComment[],
  targetInfo: OverviewTargetInfo,
): Activity[] {
  const all: Activity[] = [
    ...feed.map<Activity>((e) => ({
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
      const raw = targetInfo[targetLabelKey(c.target_kind, c.target_id)];
      // feed_entry : pour les verbes dont la cible est un livre,
      // le serveur injecte le titre dans meta.book_isbn via le RPC.
      // Ici on n'a pas accès à meta côté comment, donc on reste sur le
      // verbe brut + label décoré côté RPC (titres déjà résolus).
      const label = raw?.label
        ? c.target_kind === "feed_entry"
          ? decorateFeedLabel(raw.label)
          : raw.label
        : null;
      return {
        kind: "comment",
        date: c.created_at,
        id: `comment-${c.id}`,
        body: c.body,
        targetKind: c.target_kind,
        targetLabel: label,
        targetAuthor:
          raw?.author_user_id && raw.author_label
            ? { userId: raw.author_user_id, label: raw.author_label }
            : null,
        isReply: c.parent_id !== null,
        deleted: c.deleted_at !== null,
      };
    }),
  ];
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return all.slice(0, LIMIT);
}

// Le RPC retourne le `verb` brut pour les feed_entry. On le traduit en
// libellé humain pour matcher l'ancien rendu côté admin.
function decorateFeedLabel(label: string): string {
  return VERB_LABELS[label] ?? label;
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
