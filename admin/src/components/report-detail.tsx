import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getContentContext,
  getModerationUserReports,
  getReporterStats,
  getUserModerationStats,
  getUserRecentContent,
  moderate,
  sendModerationMessage,
  type ContentContext,
  type ModerateAction,
  type ModerateRecipient,
  type ModerationReport,
  type RecentContentItem,
  type ReporterStat,
  type ReportTargetKind,
  type UserModerationStats,
} from "../lib/admin-queries";

type Props = {
  ownerId: string;
  ownerLabel: string;
  ownerIsBanned: boolean;
  onModerated: () => void;
};

const KIND_LABELS: Record<ReportTargetKind, string> = {
  feed_entry: "Publication",
  comment: "Commentaire",
  sheet: "Fiche de lecture",
  bingo: "Bingo",
  user: "Profil",
};

const KIND_LABELS_LOWER: Record<ReportTargetKind, string> = {
  feed_entry: "publication",
  comment: "commentaire",
  sheet: "fiche de lecture",
  bingo: "bingo",
  user: "profil",
};

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harcèlement",
  hate: "Haine",
  sexual: "Contenu sexuel",
  illegal: "Illégal",
  self_harm: "Auto-mutilation",
  misinformation: "Désinformation",
  other: "Autre",
};

// Templates de messages auto-envoyés via la messagerie in-app après une
// action de modération. L'admin est l'expéditeur (sender_id = auth.uid()).
// Le user peut répondre directement dans le thread créé.
function buildAuthorMessage(
  kind: ReportTargetKind,
  action: ModerateAction,
  reason: string | null,
): string {
  const subject = KIND_LABELS_LOWER[kind];
  const banned = action === "delete_and_ban";
  const lines: string[] = ["Bonjour,"];

  if (kind === "user") {
    if (banned) {
      lines.push(
        "",
        "Suite à plusieurs signalements concernant ton profil, ton compte a été suspendu car il ne respectait pas les règles de la communauté Grimolia.",
      );
    } else {
      lines.push(
        "",
        "Suite à un signalement concernant ton profil, l'équipe Grimolia te demande de revoir certains éléments (photo, nom d'utilisateur) qui ne respectent pas nos règles de communauté.",
      );
    }
  } else {
    lines.push(
      "",
      `Ton ${subject} a été supprimé(e) car il ne respectait pas les règles de la communauté Grimolia.`,
    );
    if (banned) {
      lines.push(
        "",
        "De plus, ton compte a été suspendu en raison de plusieurs manquements à nos règles.",
      );
    }
  }

  if (reason && reason.trim().length > 0) {
    lines.push("", `Raison : ${reason.trim()}`);
  }

  lines.push(
    "",
    "Si tu penses qu'il s'agit d'une erreur, tu peux répondre à ce message — nous lirons.",
    "",
    "— L'équipe Grimolia",
  );
  return lines.join("\n");
}

function buildReporterMessage(kind: ReportTargetKind): string {
  const subject = KIND_LABELS_LOWER[kind];
  return [
    "Bonjour,",
    "",
    `Merci pour ton signalement. Le ${subject} que tu as signalé a été examiné et retiré pour non-respect des règles de la communauté Grimolia.`,
    "",
    "Ton aide à maintenir un espace bienveillant compte beaucoup. Continue à nous signaler tout ce qui te semble inapproprié — on regarde tout.",
    "",
    "— L'équipe Grimolia",
  ].join("\n");
}

// Compose un short preview lisible d'un contenu, selon son kind.
function renderPreview(kind: ReportTargetKind, preview: Record<string, unknown> | null): string {
  if (!preview) return "(contenu introuvable)";
  switch (kind) {
    case "feed_entry": {
      const verb = (preview.verb as string) ?? "";
      const meta = (preview.meta as Record<string, unknown>) ?? {};
      const text =
        (meta.body as string) ?? (meta.note as string) ?? (meta.title as string) ?? "";
      return text ? `[${verb}] ${text}` : `[${verb}]`;
    }
    case "comment":
      return (preview.body as string) ?? "(corps manquant)";
    case "sheet": {
      const content = (preview.content as Record<string, unknown>) ?? {};
      const sections =
        (content.sections as { body?: string }[] | undefined) ?? [];
      const first = sections.find((s) => s.body && s.body.trim().length > 0);
      return first?.body?.slice(0, 200) ?? "(fiche)";
    }
    case "bingo":
      return (preview.title as string) ?? "(bingo)";
    case "user": {
      const username = (preview.username as string) ?? "";
      const displayName = (preview.display_name as string) ?? "";
      return username ? `@${username}` : displayName || "(profil)";
    }
  }
}

// Groupe les reports par contenu signalé (target_kind + target_id) pour
// que l'admin agisse au niveau du contenu (et pas du report individuel).
type ReportGroup = {
  key: string;
  kind: ReportTargetKind;
  targetId: string;
  preview: Record<string, unknown> | null;
  reports: ModerationReport[];
  isRemoved: boolean;
};

function groupReports(reports: ModerationReport[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const r of reports) {
    const key = `${r.target_kind}:${r.target_id}`;
    const existing = groups.get(key);
    const isRemoved =
      r.preview != null && typeof r.preview === "object"
        ? Boolean((r.preview as Record<string, unknown>).removed_at)
        : false;
    if (existing) {
      existing.reports.push(r);
    } else {
      groups.set(key, {
        key,
        kind: r.target_kind,
        targetId: r.target_id,
        preview: r.preview,
        reports: [r],
        isRemoved,
      });
    }
  }
  return Array.from(groups.values());
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ReportDetail({
  ownerId,
  ownerLabel,
  ownerIsBanned,
  onModerated,
}: Props) {
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [stats, setStats] = useState<UserModerationStats | null>(null);
  const [recentContent, setRecentContent] = useState<RecentContentItem[] | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [reporterStats, setReporterStats] = useState<Record<string, ReporterStat>>({});
  // Contexte d'un groupe (par clé groupe). Lazy load au clic.
  const [contextByGroup, setContextByGroup] = useState<Record<string, ContentContext | "loading" | { error: string }>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reasonInput, setReasonInput] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    setRecentContent(null);
    setRecentOpen(false);
    setContextByGroup({});
    try {
      const [rows, st] = await Promise.all([
        getModerationUserReports(ownerId),
        getUserModerationStats(ownerId).catch(() => null),
      ]);
      setReports(rows);
      setStats(st);
      // Stats fiabilité de chaque reporter, en batch.
      const reporterIds = Array.from(new Set(rows.map((r) => r.reporter_id)));
      if (reporterIds.length > 0) {
        try {
          const rs = await getReporterStats(reporterIds);
          setReporterStats(rs);
        } catch {
          setReporterStats({});
        }
      } else {
        setReporterStats({});
      }
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [ownerId]);

  const loadRecent = useCallback(async () => {
    if (recentContent !== null) return;
    try {
      const items = await getUserRecentContent(ownerId, 25);
      setRecentContent(items);
    } catch (e) {
      setRecentContent([]);
      setLoadError((e as Error).message);
    }
  }, [ownerId, recentContent]);

  const loadContext = useCallback(
    async (groupKey: string, kind: ReportTargetKind, targetId: string) => {
      // Toggle off si déjà ouvert.
      if (contextByGroup[groupKey]) {
        setContextByGroup((p) => {
          const next = { ...p };
          delete next[groupKey];
          return next;
        });
        return;
      }
      setContextByGroup((p) => ({ ...p, [groupKey]: "loading" }));
      try {
        const ctx = await getContentContext(kind, targetId);
        setContextByGroup((p) => ({ ...p, [groupKey]: ctx }));
      } catch (e) {
        setContextByGroup((p) => ({
          ...p,
          [groupKey]: { error: (e as Error).message },
        }));
      }
    },
    [contextByGroup],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupReports(reports), [reports]);

  // Dédup des recipients : si le même user apparaît en author + reporter
  // sur des contenus différents, on n'envoie qu'un message par paire
  // (user_id, role). On envoie 1 message par recipient unique.
  async function dispatchMessages(
    recipients: ModerateRecipient[],
    action: ModerateAction,
    reason: string | null,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const rec of recipients) {
      const key = `${rec.user_id}:${rec.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const body =
        rec.role === "author"
          ? buildAuthorMessage(rec.kind, action, reason)
          : buildReporterMessage(rec.kind);
      try {
        await sendModerationMessage(rec.user_id, body);
      } catch (e) {
        // Best-effort : un échec d'envoi ne doit pas bloquer la modération
        // déjà appliquée en DB. On surface dans actionError.
        setActionError(
          `Modération appliquée, mais message non envoyé à ${rec.user_id} : ${(e as Error).message}`,
        );
      }
    }
  }

  async function applyAction(group: ReportGroup, action: ModerateAction) {
    if (actingKey) return;
    const reportIds = group.reports.map((r) => r.id);
    const reason = (reasonInput[group.key] ?? "").trim() || null;

    const label = KIND_LABELS_LOWER[group.kind];
    const confirmMsg =
      action === "ignore"
        ? `Ignorer les ${reportIds.length} signalement(s) sur ce ${label} ?`
        : action === "delete_and_ban"
          ? `Supprimer ce ${label} ET bannir l'utilisateur ?`
          : `Supprimer ce ${label} ?`;
    if (!window.confirm(confirmMsg)) return;

    setActingKey(group.key);
    setActionError(null);
    try {
      const result = await moderate(reportIds, action, reason);
      if (action !== "ignore") {
        await dispatchMessages(result.recipients, action, reason);
      }
      await load();
      onModerated();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActingKey(null);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>{ownerLabel}</span>
        {ownerIsBanned ? (
          <span
            style={{
              background: "#ef4444",
              color: "white",
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            COMPTE BANNI
          </span>
        ) : null}
        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
          · {reports.length} signalement{reports.length > 1 ? "s" : ""} sur{" "}
          {groups.length} contenu{groups.length > 1 ? "s" : ""}
        </span>
        <div style={{ flex: 1 }} />
        <a
          href={`#/users/${encodeURIComponent(ownerId)}`}
          className="muted"
          style={{ fontSize: 12 }}
        >
          Voir l'utilisateur →
        </a>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {loadError ? <div className="error">{loadError}</div> : null}
        {actionError ? <div className="error">{actionError}</div> : null}

        {stats ? <StatsBanner stats={stats} /> : null}

        <RecentActivityPanel
          open={recentOpen}
          onToggle={() => {
            setRecentOpen((v) => !v);
            if (!recentOpen) void loadRecent();
          }}
          items={recentContent}
        />

        {groups.length === 0 ? (
          <div className="muted" style={{ textAlign: "center", padding: 40 }}>
            Aucun signalement actif.
          </div>
        ) : (
          groups.map((group) => {
            const acting = actingKey === group.key;
            const canDelete = group.kind !== "user" && !group.isRemoved;
            return (
              <section
                key={group.key}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  background: "var(--surface)",
                  marginBottom: 16,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--line)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: "var(--ink-muted)",
                    }}
                  >
                    {KIND_LABELS[group.kind]}
                  </span>
                  {group.isRemoved ? (
                    <span
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--ink-muted)",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      DÉJÀ SUPPRIMÉ
                    </span>
                  ) : null}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                    {group.reports.length} signalement
                    {group.reports.length > 1 ? "s" : ""}
                  </span>
                  <button
                    className="btn"
                    style={{
                      fontSize: 11,
                      padding: "3px 10px",
                      background: contextByGroup[group.key]
                        ? "var(--accent)"
                        : "transparent",
                      color: contextByGroup[group.key] ? "white" : "var(--ink)",
                    }}
                    onClick={() =>
                      void loadContext(group.key, group.kind, group.targetId)
                    }
                  >
                    {contextByGroup[group.key]
                      ? "Masquer contexte"
                      : "Voir contexte"}
                  </button>
                </div>

                <div style={{ padding: 16 }}>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      background: "var(--surface-2)",
                      padding: "10px 12px",
                      borderRadius: 8,
                      whiteSpace: "pre-wrap",
                      maxHeight: 200,
                      overflowY: "auto",
                    }}
                  >
                    {renderPreview(group.kind, group.preview)}
                  </div>
                </div>

                {contextByGroup[group.key] ? (
                  <div
                    style={{
                      padding: "0 16px 12px",
                    }}
                  >
                    <ContextPanel
                      kind={group.kind}
                      data={contextByGroup[group.key]!}
                      signaledTargetId={group.targetId}
                    />
                  </div>
                ) : null}

                <div
                  style={{
                    padding: "0 16px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: "var(--ink-muted)",
                    }}
                  >
                    Signalé par
                  </div>
                  {group.reports.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "8px 10px",
                        background: "var(--surface-2)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "var(--line)",
                          flexShrink: 0,
                        }}
                      >
                        {r.reporter_avatar_url ? (
                          <img
                            src={r.reporter_avatar_url}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>
                          <a
                            href={`#/users/${encodeURIComponent(r.reporter_id)}`}
                            style={{
                              color: "inherit",
                              textDecoration: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.textDecoration =
                                "underline";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.textDecoration = "none";
                            }}
                          >
                            {r.reporter_username
                              ? `@${r.reporter_username}`
                              : (r.reporter_display_name ?? "Anonyme")}
                          </a>
                          <ReporterReliabilityChip
                            stats={reporterStats[r.reporter_id]}
                          />
                          <span
                            style={{
                              marginLeft: 8,
                              fontWeight: 400,
                              color: "var(--ink-muted)",
                            }}
                          >
                            · {REASON_LABELS[r.reason] ?? r.reason} ·{" "}
                            {formatDate(r.created_at)}
                          </span>
                          {r.status !== "pending" ? (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 9,
                                fontWeight: 700,
                                background:
                                  r.status === "actioned"
                                    ? "#16a34a"
                                    : r.status === "dismissed"
                                      ? "#6b7280"
                                      : "#3b82f6",
                                color: "white",
                                padding: "1px 6px",
                                borderRadius: 999,
                              }}
                            >
                              {r.status.toUpperCase()}
                            </span>
                          ) : null}
                        </div>
                        {r.details ? (
                          <div
                            style={{
                              marginTop: 4,
                              color: "var(--ink-muted)",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {r.details}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    padding: "12px 16px",
                    borderTop: "1px solid var(--line)",
                    background: "var(--surface-2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <input
                    type="text"
                    placeholder="Raison interne / précision pour le message (optionnel)"
                    value={reasonInput[group.key] ?? ""}
                    onChange={(e) =>
                      setReasonInput((p) => ({
                        ...p,
                        [group.key]: e.target.value,
                      }))
                    }
                    style={{
                      padding: "8px 10px",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      background: "var(--surface)",
                      color: "var(--ink)",
                      fontSize: 12,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canDelete ? (
                      <button
                        className="btn"
                        disabled={acting}
                        onClick={() => void applyAction(group, "delete")}
                      >
                        {acting ? "…" : "Supprimer"}
                      </button>
                    ) : null}
                    <button
                      className="btn"
                      disabled={acting || ownerIsBanned}
                      onClick={() => void applyAction(group, "delete_and_ban")}
                      style={{
                        background: "#ef4444",
                        color: "white",
                        borderColor: "#ef4444",
                      }}
                      title={
                        ownerIsBanned
                          ? "Utilisateur déjà banni"
                          : "Supprime le contenu et bannit l'utilisateur"
                      }
                    >
                      {acting
                        ? "…"
                        : group.kind === "user"
                          ? "Bannir"
                          : "Supprimer + Bannir"}
                    </button>
                    <button
                      className="btn"
                      disabled={acting}
                      onClick={() => void applyAction(group, "ignore")}
                    >
                      {acting ? "…" : "Ignorer"}
                    </button>
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

// ════════════════════════════ Sous-composants ════════════════════════════

// Bandeau stats agrégées sur le user signalé. Donne en un coup d'œil
// l'historique : a-t-il déjà été modéré ? est-ce un récidiviste ?
function StatsBanner({ stats }: { stats: UserModerationStats }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: "10px 14px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        fontSize: 12,
      }}
    >
      <StatCell label="Signalements" value={String(stats.total)} />
      <StatCell
        label="En attente"
        value={String(stats.pending)}
        accent={stats.pending > 0 ? "red" : undefined}
      />
      <StatCell
        label="Actionnés"
        value={String(stats.actioned)}
        accent="green"
      />
      <StatCell label="Ignorés" value={String(stats.dismissed)} />
      <StatCell
        label="Reporters uniques"
        value={String(stats.distinct_reporters)}
      />
      <StatCell
        label="Contenus retirés"
        value={String(stats.removed_content_count)}
        accent={stats.removed_content_count > 0 ? "amber" : undefined}
      />
      {stats.first_reported_at ? (
        <StatCell
          label="1er signalement"
          value={formatDate(stats.first_reported_at)}
        />
      ) : null}
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "red" | "green" | "amber";
}) {
  const color =
    accent === "red"
      ? "#ef4444"
      : accent === "green"
        ? "#16a34a"
        : accent === "amber"
          ? "#d97706"
          : "var(--ink)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          color: "var(--ink-muted)",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

// Panneau dépliable d'activité récente : feeds + comments + sheets mêlés
// chronologiquement, avec flag visuel sur ce qui est déjà retiré.
function RecentActivityPanel({
  open,
  onToggle,
  items,
}: {
  open: boolean;
  onToggle: () => void;
  items: RecentContentItem[] | null;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          color: "var(--ink)",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span>
        Activité récente du compte
        <span style={{ flex: 1 }} />
        {items ? (
          <span style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 400 }}>
            {items.length} élément{items.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </button>
      {open ? (
        <div style={{ borderTop: "1px solid var(--line)", padding: 12 }}>
          {items === null ? (
            <div className="muted" style={{ textAlign: "center", padding: 12 }}>
              Chargement…
            </div>
          ) : items.length === 0 ? (
            <div className="muted" style={{ textAlign: "center", padding: 12 }}>
              Aucune activité récente.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((it) => (
                <RecentItemRow key={`${it.kind}:${it.target_id}`} item={it} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RecentItemRow({ item }: { item: RecentContentItem }) {
  const removed = item.removed_at !== null;
  const kindLabel = KIND_LABELS[item.kind as ReportTargetKind] ?? item.kind;
  let text = "";
  if (item.kind === "feed_entry") {
    const verb = (item.preview.verb as string) ?? "";
    const meta = (item.preview.meta as Record<string, unknown>) ?? {};
    const body =
      (meta.body as string) ?? (meta.note as string) ?? (meta.title as string) ?? "";
    text = body ? `[${verb}] ${body}` : `[${verb}]`;
  } else if (item.kind === "comment") {
    text = (item.preview.body as string) ?? "";
  } else if (item.kind === "sheet") {
    text = (item.preview.content_excerpt as string) ?? "";
  }
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "8px 10px",
        background: removed ? "rgba(239, 68, 68, 0.05)" : "var(--surface-2)",
        borderRadius: 6,
        border: removed ? "1px solid rgba(239, 68, 68, 0.2)" : "none",
        fontSize: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          minWidth: 70,
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--ink-muted)",
          marginTop: 2,
        }}
      >
        {kindLabel}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 80,
            overflow: "hidden",
          }}
        >
          {text || <em style={{ color: "var(--ink-muted)" }}>(vide)</em>}
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 10,
            color: "var(--ink-muted)",
          }}
        >
          {formatDate(item.created_at)}
          {removed ? " · RETIRÉ" : ""}
        </div>
      </div>
    </div>
  );
}

// Chip de fiabilité d'un reporter. Vert si bon ratio actioned/total,
// rouge si beaucoup de signalements ignorés (= reporter abusif).
function ReporterReliabilityChip({ stats }: { stats: ReporterStat | undefined }) {
  if (!stats || stats.total <= 1) return null;
  // Ignore si reporter rookie (1 seul signalement, pas de signal fiable).
  const decided = stats.actioned + stats.dismissed;
  if (decided === 0) {
    return (
      <span
        style={{
          marginLeft: 6,
          fontSize: 9,
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: 999,
          background: "var(--surface-2)",
          color: "var(--ink-muted)",
        }}
        title={`${stats.total} signalement(s) au total, aucun statué`}
      >
        {stats.total} signal.
      </span>
    );
  }
  const actionedRatio = stats.actioned / decided;
  const color =
    actionedRatio >= 0.5
      ? { bg: "#16a34a", fg: "white" }
      : actionedRatio >= 0.2
        ? { bg: "#d97706", fg: "white" }
        : { bg: "#ef4444", fg: "white" };
  return (
    <span
      style={{
        marginLeft: 6,
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 6px",
        borderRadius: 999,
        background: color.bg,
        color: color.fg,
      }}
      title={`${stats.actioned}/${decided} signalements statués actionnés (${stats.total} au total)`}
    >
      {stats.actioned}/{decided}
    </span>
  );
}

// Panneau de contexte : selon le kind, rend différentes vues. Lazy loaded.
function ContextPanel({
  kind,
  data,
  signaledTargetId,
}: {
  kind: ReportTargetKind;
  data: ContentContext | "loading" | { error: string };
  signaledTargetId: string;
}) {
  if (data === "loading") {
    return (
      <div className="muted" style={{ padding: 12, textAlign: "center" }}>
        Chargement du contexte…
      </div>
    );
  }
  if ("error" in data) {
    return <div className="error">{data.error}</div>;
  }
  return (
    <div
      style={{
        background: "var(--surface-2)",
        borderRadius: 8,
        padding: 12,
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          color: "var(--ink-muted)",
          letterSpacing: 0.5,
        }}
      >
        Contexte
      </div>

      {kind === "comment" && data.parent ? (
        <ContextBlock title="Contenu commenté (parent)">
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(data.parent, null, 2)}
          </pre>
        </ContextBlock>
      ) : null}

      {kind === "comment" && data.siblings && data.siblings.length > 0 ? (
        <ContextBlock
          title={`Thread complet (${data.siblings.length} commentaire${data.siblings.length > 1 ? "s" : ""})`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.siblings.map((c) => {
              const isReply = c.parent_id !== null;
              const isThis = c.is_signaled;
              return (
                <div
                  key={c.id}
                  style={{
                    paddingLeft: isReply ? 18 : 0,
                    borderLeft: isThis ? "3px solid #ef4444" : "none",
                    background: isThis
                      ? "rgba(239, 68, 68, 0.08)"
                      : "transparent",
                    padding: "6px 10px",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <a
                      href={`#/users/${encodeURIComponent(c.user_id)}`}
                      style={{
                        fontWeight: 600,
                        color: "inherit",
                        textDecoration: "none",
                      }}
                    >
                      {c.username ? `@${c.username}` : c.user_id.slice(0, 8)}
                    </a>
                    <span
                      style={{ fontSize: 10, color: "var(--ink-muted)" }}
                    >
                      {formatDate(c.created_at)}
                    </span>
                    {isThis ? (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          background: "#ef4444",
                          color: "white",
                          padding: "1px 6px",
                          borderRadius: 999,
                        }}
                      >
                        SIGNALÉ
                      </span>
                    ) : null}
                    {c.removed_at ? (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          background: "var(--ink-muted)",
                          color: "white",
                          padding: "1px 6px",
                          borderRadius: 999,
                        }}
                      >
                        RETIRÉ
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      whiteSpace: "pre-wrap",
                      color: c.deleted_at ? "var(--ink-muted)" : "var(--ink)",
                      fontStyle: c.deleted_at ? "italic" : "normal",
                    }}
                  >
                    {c.deleted_at ? "[supprimé par l'auteur]" : c.body}
                  </div>
                </div>
              );
            })}
          </div>
        </ContextBlock>
      ) : null}

      {kind === "feed_entry" && data.target_content ? (
        <ContextBlock title={`Contenu lié (${data.target_content.kind})`}>
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(data.target_content, null, 2)}
          </pre>
        </ContextBlock>
      ) : null}

      {kind === "feed_entry" && data.comments && data.comments.length > 0 ? (
        <ContextBlock
          title={`Commentaires reçus (${data.comments.length})`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {data.comments.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: "4px 8px",
                  background: "var(--surface)",
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                <a
                  href={`#/users/${encodeURIComponent(c.user_id)}`}
                  style={{
                    fontWeight: 600,
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  {c.username ? `@${c.username}` : c.user_id.slice(0, 8)}
                </a>
                <span
                  style={{
                    marginLeft: 6,
                    color: "var(--ink-muted)",
                    fontSize: 10,
                  }}
                >
                  {formatDate(c.created_at)}
                  {c.parent_id ? " · réponse" : ""}
                  {c.removed_at ? " · RETIRÉ" : ""}
                  {c.deleted_at ? " · supprimé" : ""}
                </span>
                <div
                  style={{
                    marginTop: 2,
                    whiteSpace: "pre-wrap",
                    fontStyle: c.deleted_at ? "italic" : "normal",
                  }}
                >
                  {c.deleted_at ? "[supprimé]" : c.body}
                </div>
              </div>
            ))}
          </div>
        </ContextBlock>
      ) : null}

      {kind === "sheet" && data.sheet ? (
        <ContextBlock title="Fiche complète">
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 400,
              overflow: "auto",
            }}
          >
            {JSON.stringify(data.sheet, null, 2)}
          </pre>
          {data.book ? (
            <div
              style={{ marginTop: 8, fontSize: 11, color: "var(--ink-muted)" }}
            >
              Livre : {data.book.title} · {data.book.authors.join(", ")}
            </div>
          ) : null}
        </ContextBlock>
      ) : null}

      {kind === "bingo" && data.bingo ? (
        <ContextBlock title="Bingo complet">
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 400,
              overflow: "auto",
            }}
          >
            {JSON.stringify(data.bingo, null, 2)}
          </pre>
        </ContextBlock>
      ) : null}

      {kind === "user" && data.profile ? (
        <ContextBlock title="Profil signalé">
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(data.profile, null, 2)}
          </pre>
        </ContextBlock>
      ) : null}

      <div style={{ fontSize: 10, color: "var(--ink-muted)" }}>
        Cible signalée : <code>{signaledTargetId}</code>
      </div>
    </div>
  );
}

function ContextBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ink)",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
