import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  AdminUserAppearance,
  AdminUserProfile,
  AvatarFrameCatalogRow,
  BadgeCatalogRow,
  BorderCatalogRow,
  FondCatalogRow,
  UserBadgeRow,
} from "../lib/types";
import { UserRichCard } from "./user-rich-card";

type Stat = { label: string; value: string | number };

type Props = {
  userId: string | null;
  // Stats affichées dans la grille (cf. UserRichCard). Ordre = ordre rendu.
  stats?: Stat[];
};

// Wrapper auto-loader autour de `UserRichCard` : à partir d'un userId,
// charge en parallèle profil + email (admin_user_card) + badges débloqués
// + catalog rows ciblés (border/fond/frame selon `profile.preferences`).
//
// Sert à hisser la UserRichCard dans n'importe quel form admin
// (bingo-pill-form, book-form, …) avec une seule prop `userId`. Réutilise
// les policies admin SELECT (cf. 0059) qui rendent profiles/user_badges
// lisibles cross-user pour les admins.
export function UserRichCardLoader({ userId, stats }: Props) {
  const [profile, setProfile] = useState<AdminUserProfile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [unlockedBadgeKeys, setUnlockedBadgeKeys] = useState<string[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<BadgeCatalogRow[]>([]);
  const [border, setBorder] = useState<BorderCatalogRow | null>(null);
  const [fond, setFond] = useState<FondCatalogRow | null>(null);
  const [frame, setFrame] = useState<AvatarFrameCatalogRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setEmail(null);
    setUnlockedBadgeKeys([]);
    setBorder(null);
    setFond(null);
    setFrame(null);

    if (!userId) return;

    void (async () => {
      // Profil + email en parallèle des badges et du catalog.
      const [profileRes, cardRes, badgesRes, badgeCatRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,username,display_name,avatar_url,is_premium,is_admin,premium_until,preferences,created_at",
          )
          .eq("id", userId)
          .maybeSingle(),
        supabase.rpc("admin_user_card", { p_user_id: userId }),
        supabase
          .from("user_badges")
          .select("*")
          .eq("user_id", userId)
          .order("earned_at", { ascending: false }),
        supabase
          .from("badge_catalog")
          .select("*")
          .order("badge_key", { ascending: true }),
      ]);
      if (cancelled) return;

      const prof = (profileRes.data as AdminUserProfile | null) ?? null;
      setProfile(prof);
      const cardRows = (cardRes.data ?? []) as { email: string | null }[];
      setEmail(cardRows[0]?.email ?? null);
      setUnlockedBadgeKeys(
        ((badgesRes.data ?? []) as UserBadgeRow[]).map((b) => b.badge_key),
      );
      setBadgeCatalog((badgeCatRes.data ?? []) as BadgeCatalogRow[]);

      if (!prof) return;

      const appearance = readAppearance(prof.preferences);
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
              if (!cancelled) setFrame(data as AvatarFrameCatalogRow | null);
            }),
        );
      }

      await Promise.all(tasks);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <UserRichCard
      profile={profile}
      email={email}
      lastActivityAt={null}
      unlockedBadgeKeys={unlockedBadgeKeys}
      badgeCatalog={badgeCatalog}
      border={border}
      fond={fond}
      frame={frame}
      stats={stats}
    />
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
