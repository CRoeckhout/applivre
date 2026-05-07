import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
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
      {sub === "bingos" && <BingosTab userId={userId} />}
      {sub === "daily" && <DailyTab userId={userId} />}
      {sub === "annual" && <AnnualTab userId={userId} />}
    </div>
  );
}

// ─── Bingos ─────────────────────────────────────────────────────────────

type BingoCell = { label?: string };
type BingoGrid = { size?: number; cells?: BingoCell[] };

function BingosTab({ userId }: { userId: string }) {
  const [bingos, setBingos] = useState<BingoRow[] | null>(null);
  const [completions, setCompletions] = useState<
    BingoCompletionRow[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: bs, error: bErr } = await supabase
        .from("bingos")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (bErr) {
        setError(bErr.message);
        return;
      }
      setBingos((bs ?? []) as BingoRow[]);
      const ids = (bs ?? []).map((b) => (b as BingoRow).id);
      if (ids.length === 0) {
        setCompletions([]);
        return;
      }
      const { data: cs, error: cErr } = await supabase
        .from("bingo_completions")
        .select("*")
        .in("bingo_id", ids);
      if (cancelled) return;
      if (cErr) {
        setError(cErr.message);
        return;
      }
      setCompletions((cs ?? []) as BingoCompletionRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const byBingo = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const c of completions ?? []) {
      const set = map.get(c.bingo_id) ?? new Set<number>();
      set.add(c.cell_index);
      map.set(c.bingo_id, set);
    }
    return map;
  }, [completions]);

  if (error) return <div className="error">Erreur : {error}</div>;
  if (!bingos || !completions) return <div className="muted">Chargement…</div>;
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

function DailyTab({ userId }: { userId: string }) {
  const [days, setDays] = useState<ReadingStreakDayRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("reading_streak_days")
        .select("*")
        .eq("user_id", userId)
        .order("day", { ascending: false })
        .limit(120);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setDays((data ?? []) as ReadingStreakDayRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) return <div className="error">Erreur : {error}</div>;
  if (!days) return <div className="muted">Chargement…</div>;

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
        90 derniers jours · {days.filter((d) => set.has(d.day)).length}{" "}
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

function AnnualTab({ userId }: { userId: string }) {
  const [challenges, setChallenges] = useState<
    ReadingChallengeRow[] | null
  >(null);
  const [readByYear, setReadByYear] = useState<Map<number, number> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: chs, error: cErr } = await supabase
        .from("reading_challenges")
        .select("*")
        .eq("user_id", userId)
        .order("year", { ascending: false });
      if (cancelled) return;
      if (cErr) {
        setError(cErr.message);
        return;
      }
      setChallenges((chs ?? []) as ReadingChallengeRow[]);

      const { data: rb, error: rbErr } = await supabase
        .from("user_books")
        .select("finished_at")
        .eq("user_id", userId)
        .eq("status", "read")
        .not("finished_at", "is", null);
      if (cancelled) return;
      if (rbErr) {
        setError(rbErr.message);
        return;
      }
      const map = new Map<number, number>();
      for (const r of (rb ?? []) as { finished_at: string }[]) {
        const y = new Date(r.finished_at).getFullYear();
        map.set(y, (map.get(y) ?? 0) + 1);
      }
      setReadByYear(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) return <div className="error">Erreur : {error}</div>;
  if (!challenges || !readByYear)
    return <div className="muted">Chargement…</div>;
  if (challenges.length === 0)
    return <div className="muted">Aucun défi annuel défini.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {challenges.map((c) => {
        const got = readByYear.get(c.year) ?? 0;
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
