import { useEffect, useMemo, useState } from "react";
import { BadgeGraphicWeb } from "../../lib/badge-graphic";
import { supabase } from "../../lib/supabase";
import type { BadgeCatalogRow, UserBadgeRow } from "../../lib/types";

type Props = {
  userId: string;
  badgeCatalog: BadgeCatalogRow[];
};

export function BadgesPanel({ userId, badgeCatalog }: Props) {
  const [unlocked, setUnlocked] = useState<UserBadgeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("user_badges")
        .select("*")
        .eq("user_id", userId)
        .order("earned_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setUnlocked((data ?? []) as UserBadgeRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const earnedAtByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of unlocked ?? []) map.set(u.badge_key, u.earned_at);
    return map;
  }, [unlocked]);

  if (error) return <div className="error">Erreur : {error}</div>;
  if (!unlocked) return <div className="muted">Chargement…</div>;

  // On affiche tous les badges du catalog actifs, séparés en "débloqués" /
  // "verrouillés" pour avoir le state complet en une vue.
  const active = badgeCatalog.filter((b) => b.retired_at === null);
  const unlockedSet = new Set(unlocked.map((u) => u.badge_key));
  const u = active.filter((b) => unlockedSet.has(b.badge_key));
  const l = active.filter((b) => !unlockedSet.has(b.badge_key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <BadgeGroup
        title={`Débloqués · ${u.length}`}
        badges={u}
        earnedAtByKey={earnedAtByKey}
        unlocked
      />
      <BadgeGroup
        title={`Verrouillés · ${l.length}`}
        badges={l}
        earnedAtByKey={earnedAtByKey}
        unlocked={false}
      />
    </div>
  );
}

function BadgeGroup({
  title,
  badges,
  earnedAtByKey,
  unlocked,
}: {
  title: string;
  badges: BadgeCatalogRow[];
  earnedAtByKey: Map<string, string>;
  unlocked: boolean;
}) {
  return (
    <div>
      <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>{title}</h3>
      {badges.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          —
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 12,
          }}>
          {badges.map((b) => {
            const earnedAt = earnedAtByKey.get(b.badge_key);
            return (
              <div
                key={b.badge_key}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 10,
                  background: "var(--surface)",
                  textAlign: "center",
                  opacity: unlocked ? 1 : 0.45,
                  filter: unlocked ? "none" : "grayscale(0.8)",
                }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    margin: "0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                  <BadgeGraphicWeb
                    kind={b.graphic_kind}
                    payload={b.graphic_payload}
                    tokens={b.graphic_tokens}
                    size={56}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 6,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={b.title}>
                  {b.title}
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 10, marginTop: 2 }}>
                  {unlocked && earnedAt
                    ? new Date(earnedAt).toLocaleDateString()
                    : b.description.length > 28
                    ? b.description.slice(0, 28) + "…"
                    : b.description}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
