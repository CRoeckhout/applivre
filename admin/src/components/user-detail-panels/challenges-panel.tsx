import { useEffect, useMemo, useState } from "react";
import {
  getAdminUserChallenges,
  type AdminUserChallenges,
} from "../../lib/admin-queries";
import type {
  BingoCompletionRow,
  BingoRow,
  ReadingChallengeRow,
  ReadingStreakDayRow,
} from "../../lib/types";

type Props = { userId: string };

type SubTab = "bingos" | "daily" | "annual";

const SUBTABS: SubTab[] = ["bingos", "daily", "annual"];
const SUBTAB_LABELS: Record<SubTab, string> = {
  bingos: "Bingos",
  daily: "Journalier",
  annual: "Annuel",
};

export function ChallengesPanel({ userId }: Props) {
  const [sub, setSub] = useState<SubTab>("bingos");
  const [data, setData] = useState<AdminUserChallenges | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    void (async () => {
      try {
        const res = await getAdminUserChallenges(userId);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {SUBTABS.map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              border: "1px solid",
              borderColor: sub === s ? "var(--accent)" : "var(--line)",
              background: sub === s ? "var(--accent)" : "var(--surface)",
              color: sub === s ? "white" : "var(--ink)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}>
            {SUBTAB_LABELS[s]}
          </button>
        ))}
      </div>
      {error ? (
        <div className="error">Erreur : {error}</div>
      ) : !data ? (
        <div className="muted">Chargement…</div>
      ) : sub === "bingos" ? (
        <BingosTab bingos={data.bingos} completions={data.completions} />
      ) : sub === "daily" ? (
        <DailyTab days={data.streak_days} />
      ) : (
        <AnnualTab
          challenges={data.annual_challenges}
          readByYear={data.read_by_year}
        />
      )}
    </div>
  );
}

// ─── Bingos ─────────────────────────────────────────────────────────────

type BingoCell = { label?: string };
type BingoGrid = { size?: number; cells?: BingoCell[] };

function BingosTab({
  bingos,
  completions,
}: {
  bingos: BingoRow[];
  completions: BingoCompletionRow[];
}) {
  const byBingo = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const c of completions) {
      const set = map.get(c.bingo_id) ?? new Set<number>();
      set.add(c.cell_index);
      map.set(c.bingo_id, set);
    }
    return map;
  }, [completions]);

  if (bingos.length === 0)
    return <div className="muted">Aucun bingo créé.</div>;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 12,
      }}>
      {bingos.map((b) => {
        const grid = b.grid as BingoGrid;
        const cells = grid.cells ?? [];
        const size =
          grid.size ?? Math.round(Math.sqrt(cells.length || 9));
        const filled = byBingo.get(b.id) ?? new Set<number>();
        const total = cells.length || size * size;
        const percent = total > 0 ? Math.round((filled.size / total) * 100) : 0;
        return (
          <div
            key={b.id}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 12,
              background: "var(--surface)",
            }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}>
              <strong style={{ fontSize: 13 }}>{b.title}</strong>
              <span className="muted" style={{ fontSize: 11 }}>
                {filled.size}/{total} · {percent}%
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${size}, 1fr)`,
                gap: 2,
              }}>
              {cells.slice(0, size * size).map((c, idx) => {
                const done = filled.has(idx);
                return (
                  <div
                    key={idx}
                    title={c.label}
                    style={{
                      aspectRatio: "1 / 1",
                      borderRadius: 4,
                      background: done
                        ? "var(--accent)"
                        : "var(--surface-2)",
                      color: done ? "white" : "var(--ink-muted)",
                      fontSize: 9,
                      padding: 2,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      lineHeight: 1.1,
                    }}>
                    {c.label ?? ""}
                  </div>
                );
              })}
            </div>
            <div
              className="muted"
              style={{ fontSize: 10, marginTop: 6 }}>
              Créé le {new Date(b.created_at).toLocaleDateString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Daily streak ───────────────────────────────────────────────────────

function DailyTab({ days }: { days: ReadingStreakDayRow[] }) {
  // Calendrier 90 derniers jours.
  const set = new Set(days.map((d) => d.day));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells: { date: string; done: boolean }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    cells.push({ date: iso, done: set.has(iso) });
  }
  const goalSample = days.find((d) => d.goal_minutes !== null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12 }} className="muted">
        90 derniers jours · {cells.filter((c) => c.done).length}{" "}
        jours validés
        {goalSample?.goal_minutes
          ? ` · objectif ${goalSample.goal_minutes} min/jour`
          : ""}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(15, 1fr)",
          gap: 3,
        }}>
        {cells.map((c) => (
          <div
            key={c.date}
            title={c.date}
            style={{
              aspectRatio: "1 / 1",
              borderRadius: 3,
              background: c.done
                ? "var(--accent)"
                : "var(--surface-2)",
              opacity: c.done ? 1 : 0.6,
            }}
          />
        ))}
      </div>
      {days.length === 0 && (
        <div className="muted" style={{ fontSize: 12 }}>
          Aucun jour de streak enregistré.
        </div>
      )}
    </div>
  );
}

// ─── Annual challenge ───────────────────────────────────────────────────

function AnnualTab({
  challenges,
  readByYear,
}: {
  challenges: ReadingChallengeRow[];
  readByYear: Record<string, number>;
}) {
  if (challenges.length === 0)
    return <div className="muted">Aucun défi annuel défini.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {challenges.map((c) => {
        const got = readByYear[String(c.year)] ?? 0;
        const percent = Math.min(
          100,
          Math.round((got / Math.max(1, c.target_count)) * 100),
        );
        return (
          <div
            key={c.id}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 12,
              background: "var(--surface)",
            }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}>
              <strong>Défi {c.year}</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {got} / {c.target_count} livres · {percent}%
              </span>
            </div>
            <div
              style={{
                height: 8,
                background: "var(--surface-2)",
                borderRadius: 4,
                overflow: "hidden",
              }}>
              <div
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
