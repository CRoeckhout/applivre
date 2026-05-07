import { useEffect, useState } from "react";
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
  const [subTab, setSubTab] = useState<SubTab>("overview");

  // Reset du sub-tab quand on change d'utilisateur — sinon on reste sur
  // "Sessions" en sélectionnant un autre user, ce qui surprend.
  useEffect(() => {
    setSubTab("overview");
  }, [userId]);

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

    void (async () => {
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select(
          "id,username,display_name,avatar_url,is_premium,is_admin,premium_until,preferences,created_at",
        )
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (pErr) {
        setProfileError(pErr.message);
        return;
      }
      const prof = p as AdminUserProfile | null;
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

      tasks.push(
        supabase
          .from("user_badges")
          .select("*")
          .eq("user_id", userId)
          .order("earned_at", { ascending: false })
          .then(({ data }) => {
            if (!cancelled)
              setUnlockedBadges((data ?? []) as UserBadgeRow[]);
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
              ]
            : undefined
        }
      />

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
