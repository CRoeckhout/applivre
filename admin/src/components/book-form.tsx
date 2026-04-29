import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  BOOK_SOURCES,
  type AiCleanedBook,
  type BookCatalogRow,
  type BookSource,
} from "../lib/types";
import { AiCleanupModal } from "./ai-cleanup-modal";

type Props = {
  initial: BookCatalogRow;
  onSaved: (saved: BookCatalogRow) => void;
  onDeleted: (isbn: string) => void;
};

type Uploader = {
  user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  account_created_at: string | null;
  added_at: string;
  added_count: number;
  library_count: number;
};

export function BookForm({ initial, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [authorsText, setAuthorsText] = useState(initial.authors.join(", "));
  const [pages, setPages] = useState(
    initial.pages != null ? String(initial.pages) : "",
  );
  const [publishedAt, setPublishedAt] = useState(initial.published_at ?? "");
  const [coverUrl, setCoverUrl] = useState(initial.cover_url ?? "");
  const [source, setSource] = useState<BookSource | "">(initial.source ?? "");
  const [categoriesText, setCategoriesText] = useState(
    initial.categories.join(", "),
  );

  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [uploader, setUploader] = useState<Uploader | null>(null);
  const [uploaderLoading, setUploaderLoading] = useState(false);
  const [uploaderError, setUploaderError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposal, setAiProposal] = useState<{
    cleaned: AiCleanedBook;
    model: string;
  } | null>(null);

  useEffect(() => {
    setTitle(initial.title);
    setAuthorsText(initial.authors.join(", "));
    setPages(initial.pages != null ? String(initial.pages) : "");
    setPublishedAt(initial.published_at ?? "");
    setCoverUrl(initial.cover_url ?? "");
    setSource(initial.source ?? "");
    setCategoriesText(initial.categories.join(", "));
    setError(null);
    setSuccess(null);
    setUsageCount(null);
    setUploader(null);
    setUploaderError(null);

    void loadUsage();
    void loadUploader();

    async function loadUsage() {
      const { count, error: err } = await supabase
        .from("user_books")
        .select("id", { count: "exact", head: true })
        .eq("book_isbn", initial.isbn);
      if (!err) setUsageCount(count ?? 0);
    }

    async function loadUploader() {
      setUploaderLoading(true);
      const { data, error: err } = await supabase.rpc("admin_book_uploader", {
        p_isbn: initial.isbn,
      });
      setUploaderLoading(false);
      if (err) {
        setUploaderError(err.message);
        return;
      }
      const rows = (data ?? []) as Uploader[];
      setUploader(rows[0] ?? null);
    }
  }, [initial]);

  function parseCsv(s: string): string[] {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }

  async function save() {
    setError(null);
    setSuccess(null);
    if (!title.trim()) {
      setError("Titre requis");
      return;
    }
    const pagesNum = pages.trim() === "" ? null : Number.parseInt(pages, 10);
    if (pagesNum != null && (!Number.isFinite(pagesNum) || pagesNum < 0)) {
      setError("Pages doit être un entier positif");
      return;
    }
    setSubmitting(true);
    try {
      const row = {
        title: title.trim(),
        authors: parseCsv(authorsText),
        pages: pagesNum,
        published_at: publishedAt.trim() || null,
        cover_url: coverUrl.trim() || null,
        source: source === "" ? null : source,
        categories: parseCsv(categoriesText),
      };
      const { data, error: upErr } = await supabase
        .from("books")
        .update(row)
        .eq("isbn", initial.isbn)
        .select()
        .single();
      if (upErr) {
        setError(`Save échec : ${upErr.message}`);
        return;
      }
      setSuccess("Enregistré.");
      onSaved(data as BookCatalogRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  async function runAiExtraction() {
    setError(null);
    setSuccess(null);
    setAiLoading(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke<{
        ok: boolean;
        model?: string;
        cleaned?: AiCleanedBook;
        error?: string;
      }>("extract-book-metadata", {
        body: {
          isbn: initial.isbn,
          title: title.trim(),
          authors: parseCsv(authorsText),
          categories: parseCsv(categoriesText),
        },
      });
      if (invokeErr) {
        setError(`IA : ${invokeErr.message}`);
        return;
      }
      if (!data?.ok || !data.cleaned) {
        setError(`IA : ${data?.error ?? "erreur inconnue"}`);
        return;
      }
      setAiProposal({ cleaned: data.cleaned, model: data.model ?? "unknown" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "IA : erreur inconnue");
    } finally {
      setAiLoading(false);
    }
  }

  async function applyAiSelection(selected: {
    title?: string;
    authors?: string[];
    categories?: string[];
  }) {
    const patch: Record<string, unknown> = {
      ai_cleaned_at: new Date().toISOString(),
    };
    if (selected.title !== undefined) patch.title = selected.title;
    if (selected.authors !== undefined) patch.authors = selected.authors;
    if (selected.categories !== undefined)
      patch.categories = selected.categories;

    const { data, error: upErr } = await supabase
      .from("books")
      .update(patch)
      .eq("isbn", initial.isbn)
      .select()
      .single();
    if (upErr) throw new Error(upErr.message);

    const row = data as BookCatalogRow;
    setTitle(row.title);
    setAuthorsText(row.authors.join(", "));
    setCategoriesText(row.categories.join(", "));
    setSuccess("Métadonnées IA appliquées.");
    setAiProposal(null);
    onSaved(row);
  }

  async function remove() {
    const usage = usageCount ?? 0;
    const warning =
      usage > 0
        ? `⚠️ Ce livre est dans ${usage} étagère(s) utilisateur. Supprimer le livre va aussi supprimer en cascade tous les user_books, sessions, prêts et fiches associés.\n\nConfirmer la suppression de "${initial.title}" (${initial.isbn}) ?`
        : `Supprimer définitivement "${initial.title}" (${initial.isbn}) ?`;
    if (!confirm(warning)) return;

    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from("books")
      .delete()
      .eq("isbn", initial.isbn);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted(initial.isbn);
  }

  return (
    <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 240px",
          gap: 32,
          alignItems: "start",
        }}
      >
        <div>
          <h2 style={{ marginTop: 0, fontFamily: "monospace" }}>
            {initial.isbn}
          </h2>

          <div className="field">
            <label>Titre</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label>Auteurs (CSV)</label>
            <input
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              placeholder="Auteur 1, Auteur 2"
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Pages</label>
              <input
                type="number"
                min={0}
                value={pages}
                onChange={(e) => setPages(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Année / date publication</label>
              <input
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                placeholder="2023"
              />
            </div>
          </div>

          <div className="field">
            <label>Couverture (URL)</label>
            <input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="field">
            <label>Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as BookSource | "")}
            >
              <option value="">— inconnu —</option>
              {BOOK_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Catégories (CSV)</label>
            <input
              value={categoriesText}
              onChange={(e) => setCategoriesText(e.target.value)}
              placeholder="Roman, Science-fiction"
            />
          </div>

          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Cached at: {new Date(initial.cached_at).toLocaleString()}
            {usageCount !== null && (
              <>
                {" "}
                · Utilisé dans <strong>{usageCount}</strong> étagère(s)
              </>
            )}
            {initial.ai_cleaned_at && (
              <>
                {" "}
                · IA :{" "}
                <strong>
                  {new Date(initial.ai_cleaned_at).toLocaleDateString()}
                </strong>
              </>
            )}
          </div>

          <UploaderCard
            loading={uploaderLoading}
            error={uploaderError}
            uploader={uploader}
          />

          {error && (
            <div className="error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          {success && (
            <div className="success" style={{ marginBottom: 12 }}>
              {success}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={submitting || aiLoading}
            >
              {submitting ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              className="btn"
              onClick={runAiExtraction}
              disabled={submitting || aiLoading}
            >
              {aiLoading ? "IA…" : "Compléter avec l'IA"}
            </button>
            <button
              className="btn btn-danger"
              onClick={remove}
              disabled={submitting || aiLoading}
            >
              Supprimer
            </button>
          </div>
        </div>

        <div style={{ position: "sticky", top: 24 }}>
          <h3 style={{ marginTop: 0 }}>Aperçu</h3>
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              border: "1px solid var(--line)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                style={{
                  width: 160,
                  maxHeight: 240,
                  objectFit: "contain",
                  borderRadius: 6,
                  border: "1px solid var(--line)",
                }}
              />
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                Pas de couverture
              </div>
            )}
            <div style={{ width: "100%", textAlign: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {title || "—"}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {parseCsv(authorsText).join(", ") || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {aiProposal && (
        <AiCleanupModal
          isbn={initial.isbn}
          current={{
            title: title.trim(),
            authors: parseCsv(authorsText),
            categories: parseCsv(categoriesText),
          }}
          proposed={aiProposal.cleaned}
          model={aiProposal.model}
          onApply={applyAiSelection}
          onClose={() => setAiProposal(null)}
        />
      )}
    </main>
  );
}

function UploaderCard({
  loading,
  error,
  uploader,
}: {
  loading: boolean;
  error: string | null;
  uploader: Uploader | null;
}) {
  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--line)",
    background: "var(--surface)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div className="muted" style={{ fontSize: 13 }}>
          Chargement de l'uploader…
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={cardStyle}>
        <div className="error" style={{ fontSize: 13 }}>
          Erreur : {error}
        </div>
      </div>
    );
  }
  if (!uploader) {
    return (
      <div style={cardStyle}>
        <div className="muted" style={{ fontSize: 13 }}>
          Aucun utilisateur n'a encore ajouté ce livre.
        </div>
      </div>
    );
  }

  const name =
    uploader.display_name ||
    uploader.username ||
    uploader.email ||
    "Utilisateur";
  const initials =
    name
      .split(/[\s.@_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background: "var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 18,
            color: "var(--text-muted, #888)",
          }}
        >
          {uploader.avatar_url ? (
            <img
              src={uploader.avatar_url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            initials
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
            {uploader.username ?? uploader.display_name ?? "—"}
          </div>
          <div
            className="muted"
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={uploader.email ?? ""}
          >
            {uploader.email ?? "—"}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 12,
        }}
      >
        <Stat label="Ajoutés au catalogue" value={uploader.added_count} />
        <Stat label="Bibliothèque" value={uploader.library_count} />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--line)",
          fontSize: 12,
        }}
      >
        <span className="muted">
          Compte :{" "}
          <strong style={{ color: "var(--text)" }}>
            {uploader.account_created_at
              ? new Date(uploader.account_created_at).toLocaleDateString()
              : "—"}
          </strong>
        </span>
        <span className="muted">
          Livre ajouté le :{" "}
          <strong style={{ color: "var(--text)" }}>
            {new Date(uploader.added_at).toLocaleDateString()}
          </strong>
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "var(--bg, transparent)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "8px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
