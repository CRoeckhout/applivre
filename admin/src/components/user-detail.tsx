import { useCallback, useEffect, useState } from "react";
import {
  banUser,
  getAdminUserBadges,
  getAdminUserProfile,
  unbanUser,
} from "../lib/admin-queries";
import { supabase } from "../lib/supabase";
import type {
  AdminUserAppearance,
  AdminUserListItem,
  AdminUserProfile,
  AvatarFrameCatalogRow,
  BadgeCatalogRow,
  BorderCatalogRow,
  FondCatalogRow,
  UserBadgeRow,
} from "../lib/types";
import { BadgesPanel } from "./user-detail-panels/badges-panel";
import { BooksPanel } from "./user-detail-panels/books-panel";
import { ChallengesPanel } from "./user-detail-panels/challenges-panel";
import { LoansPanel } from "./user-detail-panels/loans-panel";
import { OverviewPanel } from "./user-detail-panels/overview-panel";
import { SessionsPanel } from "./user-detail-panels/sessions-panel";
import { SheetsPanel } from "./user-detail-panels/sheets-panel";
import { UserRichCard } from "./user-rich-card";

type SubTab =
  | "overview"
  | "books"
  | "sheets"
  | "challenges"
  | "loans"
  | "sessions"
  | "badges";

const SUBTABS: SubTab[] = [
  "overview",
  "books",
  "sheets",
  "challenges",
  "loans",
  "sessions",
  "badges",
];
const SUBTAB_LABELS: Record<SubTab, string> = {
  overview: "Vue d'ensemble",
  books: "Livres",
  sheets: "Fiches",
  challenges: "Défis",
  loans: "Prêts / emprunts",
  sessions: "Séances",
  badges: "Badges",
};

const SUBTAB_STORAGE_KEY = "admin-user-detail-subtab";

// Stocke `{ userId, tab }` : si on revient sur la page après un reload pour
// le MÊME user, on restaure son tab. Pour un user différent, le mismatch
// renvoie "overview" — donc plus besoin d'un useEffect de reset (qui posait
// problème en StrictMode + remount sur `key={itemId}`).
type PersistedSubTab = { userId: string; tab: SubTab };

function readPersistedSubTab(userId: string): SubTab {
  try {
    const v = localStorage.getItem(SUBTAB_STORAGE_KEY);
    if (!v) return "overview";
    const parsed = JSON.parse(v) as Partial<PersistedSubTab>;
    if (
      parsed?.userId === userId &&
      typeof parsed.tab === "string" &&
      (SUBTABS as string[]).includes(parsed.tab)
    ) {
      return parsed.tab as SubTab;
    }
  } catch {
    // localStorage indisponible / JSON cassé — fallback.
  }
  return "overview";
}

function persistSubTab(userId: string, tab: SubTab): void {
  try {
    localStorage.setItem(
      SUBTAB_STORAGE_KEY,
      JSON.stringify({ userId, tab } satisfies PersistedSubTab),
    );
  } catch {
    // ignore
  }
}

type Props = {
  // L'item de la liste pour les compteurs (books_count, sheets_count, last_activity_at).
  // Permet d'éviter un round-trip pour les stats du header.
  listItem: AdminUserListItem | null;
  userId: string;
};

export function UserDetail({ listItem, userId }: Props) {
  const [profile, setProfile] = useState<AdminUserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [unlockedBadges, setUnlockedBadges] = useState<UserBadgeRow[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<BadgeCatalogRow[]>([]);
  const [border, setBorder] = useState<BorderCatalogRow | null>(null);
  const [fond, setFond] = useState<FondCatalogRow | null>(null);
  const [frame, setFrame] = useState<AvatarFrameCatalogRow | null>(null);
  // Compteurs de follows (un par sens). Fetchés en `head: true` → pas de
  // payload, juste le COUNT. RLS `social_follows_select_all` autorise la
  // lecture sans condition.
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  // Persisté en localStorage pour survivre à un reload. Le tuple
  // `{userId, tab}` garantit le reset sur changement d'user (mismatch →
  // "overview"), sans passer par un useEffect fragile en StrictMode.
  const [subTab, setSubTabState] = useState<SubTab>(() =>
    readPersistedSubTab(userId),
  );
  const setSubTab = (tab: SubTab) => {
    setSubTabState(tab);
    persistSubTab(userId, tab);
  };

  // Charge profile + appearance-derived catalog rows + badges débloqués +
  // catalog complet de badges (pour le panel + la rich card). Les catalogs
  // de border/fond/frame sont fetchés ciblés via les keys de l'appearance.
  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setProfileError(null);
    setBorder(null);
    setFond(null);
    setFrame(null);
    setUnlockedBadges([]);
    setFollowingCount(null);
    setFollowersCount(null);

    void (async () => {
      // Lecture des `profiles` via RPC SECURITY DEFINER : 0062 a droppé la
      // policy "profiles admin select", donc un SELECT direct ne renvoie
      // rien pour les autres users → "Profil indisponible" en boucle.
      let prof: AdminUserProfile | null;
      try {
        prof = await getAdminUserProfile(userId);
      } catch (err) {
        if (cancelled) return;
        setProfileError(err instanceof Error ? err.message : String(err));
        return;
      }
      if (cancelled) return;
      setProfile(prof);

      if (!prof) return;

      const appearance = readAppearance(prof.preferences);

      // Catalog rows ciblés (un par feature), en parallèle.
      const tasks: PromiseLike<unknown>[] = [];

      if (appearance.borderId) {
        tasks.push(
          supabase
            .from("border_catalog")
            .select("*")
            .eq("border_key", appearance.borderId)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled) setBorder(data as BorderCatalogRow | null);
            }),
        );
      }
      if (appearance.fondId && appearance.fondId !== "none") {
        tasks.push(
          supabase
            .from("fond_catalog")
            .select("*")
            .eq("fond_key", appearance.fondId)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled) setFond(data as FondCatalogRow | null);
            }),
        );
      }
      if (appearance.avatarFrameId && appearance.avatarFrameId !== "none") {
        tasks.push(
          supabase
            .from("avatar_frame_catalog")
            .select("*")
            .eq("frame_key", appearance.avatarFrameId)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled)
                setFrame(data as AvatarFrameCatalogRow | null);
            }),
        );
      }

      // user_badges : idem profiles, la policy "user_badges admin select"
      // a été droppée par 0062. On passe par admin_user_badges (RPC).
      tasks.push(
        getAdminUserBadges(userId)
          .then((rows) => {
            if (!cancelled) setUnlockedBadges(rows);
          })
          .catch(() => {
            /* silencieux : pas critique pour l'affichage du profil */
          }),
      );

      tasks.push(
        supabase
          .from("badge_catalog")
          .select("*")
          .order("badge_key", { ascending: true })
          .then(({ data }) => {
            if (!cancelled) setBadgeCatalog((data ?? []) as BadgeCatalogRow[]);
          }),
      );

      tasks.push(
        supabase
          .from("social_follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("follower_id", userId)
          .then(({ count }) => {
            if (!cancelled) setFollowingCount(count ?? 0);
          }),
      );
      tasks.push(
        supabase
          .from("social_follows")
          .select("followed_id", { count: "exact", head: true })
          .eq("followed_id", userId)
          .then(({ count }) => {
            if (!cancelled) setFollowersCount(count ?? 0);
          }),
      );

      await Promise.all(tasks);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
      {profileError && (
        <div className="error">Profil indisponible : {profileError}</div>
      )}

      <UserRichCard
        profile={profile}
        email={listItem?.email ?? null}
        lastActivityAt={listItem?.last_activity_at ?? null}
        unlockedBadgeKeys={unlockedBadges.map((b) => b.badge_key)}
        badgeCatalog={badgeCatalog}
        border={border}
        fond={fond}
        frame={frame}
        stats={
          listItem
            ? [
                { label: "Livres", value: listItem.books_count },
                { label: "Fiches", value: listItem.sheets_count },
                { label: "Badges", value: unlockedBadges.length },
                { label: "Abonnements", value: followingCount ?? "…" },
                { label: "Abonnés", value: followersCount ?? "…" },
              ]
            : undefined
        }
      />

      {profile ? (
        <BanPanel
          profile={profile}
          onChange={(next) => setProfile(next)}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--line)",
          paddingBottom: 8,
        }}>
        {SUBTABS.map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: subTab === t ? "var(--accent)" : "transparent",
              background: subTab === t ? "var(--accent)" : "transparent",
              color: subTab === t ? "white" : "var(--ink)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}>
            {SUBTAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {subTab === "overview" && <OverviewPanel userId={userId} />}
        {subTab === "books" && <BooksPanel userId={userId} />}
        {subTab === "sheets" && <SheetsPanel userId={userId} />}
        {subTab === "challenges" && <ChallengesPanel userId={userId} />}
        {subTab === "loans" && <LoansPanel userId={userId} />}
        {subTab === "sessions" && <SessionsPanel userId={userId} />}
        {subTab === "badges" && (
          <BadgesPanel userId={userId} badgeCatalog={badgeCatalog} />
        )}
      </div>
    </main>
  );
}

// Bandeau ban : si l'utilisateur est banni, affiche un encart rouge avec
// raison/date + bouton "Rétablir". Sinon, un bouton discret pour bannir
// manuellement (avec confirmation + raison optionnelle). Met à jour
// l'AdminUserProfile parent à chaque action pour refléter sans round-trip.
function BanPanel({
  profile,
  onChange,
}: {
  profile: AdminUserProfile;
  onChange: (next: AdminUserProfile) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBanned = profile.banned_at !== null;

  const handleUnban = useCallback(async () => {
    if (!window.confirm(`Rétablir le compte de ${profile.username ? `@${profile.username}` : "cet utilisateur"} ?`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await unbanUser(profile.id);
      onChange({
        ...profile,
        banned_at: null,
        banned_reason: null,
        banned_by: null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [profile, onChange]);

  const handleBan = useCallback(async () => {
    const reason = window.prompt(
      `Bannir ${profile.username ? `@${profile.username}` : "cet utilisateur"} ?\n\nRaison (optionnel, visible dans le panel admin) :`,
      "",
    );
    if (reason === null) return; // cancel
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = reason.trim();
      await banUser(profile.id, trimmed.length > 0 ? trimmed : null);
      onChange({
        ...profile,
        banned_at: new Date().toISOString(),
        banned_reason: trimmed.length > 0 ? trimmed : null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [profile, onChange]);

  if (isBanned) {
    const date = profile.banned_at ? new Date(profile.banned_at).toLocaleString("fr-FR") : "";
    return (
      <div
        style={{
          border: "1px solid #ef4444",
          background: "#fef2f2",
          color: "#7f1d1d",
          borderRadius: 12,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            Compte banni{date ? ` · ${date}` : ""}
          </div>
          {profile.banned_reason ? (
            <div style={{ fontSize: 12, marginTop: 2 }}>
              Raison : {profile.banned_reason}
            </div>
          ) : null}
          {error ? (
            <div style={{ fontSize: 12, marginTop: 4 }}>Erreur : {error}</div>
          ) : null}
        </div>
        <button
          className="btn"
          disabled={submitting}
          onClick={() => void handleUnban()}
          style={{
            background: "white",
            color: "#7f1d1d",
            borderColor: "#ef4444",
          }}
        >
          {submitting ? "…" : "Rétablir"}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "var(--ink-muted)",
      }}
    >
      {error ? <span style={{ color: "#ef4444" }}>{error}</span> : null}
      <div style={{ flex: 1 }} />
      <button
        className="btn"
        disabled={submitting}
        onClick={() => void handleBan()}
        style={{
          background: "transparent",
          color: "#ef4444",
          borderColor: "#ef4444",
        }}
      >
        {submitting ? "…" : "Bannir manuellement"}
      </button>
    </div>
  );
}

function readAppearance(
  preferences: Record<string, unknown> | null | undefined,
): AdminUserAppearance {
  if (!preferences) return {};
  const out: AdminUserAppearance = {};
  for (const k of [
    "fontId",
    "colorPrimary",
    "colorSecondary",
    "colorBg",
    "borderId",
    "fondId",
    "avatarFrameId",
  ] as const) {
    const v = preferences[k];
    if (typeof v === "string") out[k] = v;
  }
  if (typeof preferences.fondOpacity === "number") {
    out.fondOpacity = preferences.fondOpacity;
  }
  return out;
}
