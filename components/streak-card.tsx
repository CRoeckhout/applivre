import { useCardFrame } from "@/components/card-frame-context";
import {
  dayOffset,
  frShortWeekday,
  isConsecutive,
  lastNDays,
  todayIso,
} from "@/lib/date";
import { usePreferences } from "@/store/preferences";
import { useReadingStreak } from "@/store/reading-streak";
import { useTimer } from "@/store/timer";
import { MaterialIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

const PRESETS_MINUTES = [5, 10, 15, 30, 60];

type Streaks = { current: number; best: number };

function computeStreaks(completed: Set<string>, today: string): Streaks {
  if (completed.size === 0) return { current: 0, best: 0 };

  const sorted = [...completed].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (isConsecutive(sorted[i - 1], sorted[i])) {
      run++;
    } else {
      run = 1;
    }
    if (run > best) best = run;
  }

  const yesterday = dayOffset(today, -1);
  let cursor = completed.has(today)
    ? today
    : completed.has(yesterday)
      ? yesterday
      : null;
  let current = 0;
  while (cursor && completed.has(cursor)) {
    current++;
    cursor = dayOffset(cursor, -1);
  }

  return { current, best };
}

type StreakCardProps = {
  // Si fourni, un long-press sur le fond de la carte déclenche ce callback
  // (utilisé pour le drag-to-reorder sur l'accueil). Les boutons internes
  // gardent leurs propres actions courtes.
  onLongPress?: () => void;
  isDragging?: boolean;
};

export function StreakCard({
  onLongPress,
  isDragging = false,
}: StreakCardProps = {}) {
  const manualDays = useReadingStreak((s) => s.manualDays);
  const toggleDay = useReadingStreak((s) => s.toggleDay);
  const sessions = useTimer((s) => s.sessions);
  const goalMinutes = usePreferences((s) => s.dailyReadingGoalMinutes);
  const { inFrame, padding: framedPadding } = useCardFrame();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const today = todayIso();
  const thresholdSec = goalMinutes * 60;

  const autoDays = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const day = s.startedAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + s.durationSec);
    }
    const out = new Set<string>();
    for (const [day, total] of byDay) {
      if (total >= thresholdSec) out.add(day);
    }
    return out;
  }, [sessions, thresholdSec]);

  const completed = useMemo(() => {
    const set = new Set(manualDays);
    for (const d of autoDays) set.add(d);
    return set;
  }, [manualDays, autoDays]);

  const stats = useMemo(
    () => computeStreaks(completed, today),
    [completed, today],
  );

  const todayFromSession = autoDays.has(today);
  const todayManual = manualDays.includes(today);
  const strip = lastNDays(7, today);

  const todayButton = () => {
    if (todayFromSession) {
      return (
        <View className="flex-row items-center justify-center gap-2 rounded-full bg-accent-pale py-3">
          <Text className="text-lg">🔥</Text>
          <Text className="font-sans-med text-accent-deep">
            Validé par ta session de lecture
          </Text>
        </View>
      );
    }
    if (todayManual) {
      return (
        <Pressable
          onPress={() => toggleDay(today)}
          className="flex-row items-center justify-center gap-2 rounded-full bg-accent py-3 active:opacity-80"
        >
          <Text className="text-lg">🔥</Text>
          <Text className="font-sans-med text-paper">Validé</Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={() => toggleDay(today)}
        className="rounded-full bg-ink py-3 active:opacity-80"
      >
        <Text className="text-center font-sans-med text-paper">
          J&apos;ai lu {goalMinutes} min aujourd&apos;hui
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        disabled={!onLongPress}
      >
        <Animated.View
          entering={FadeIn.duration(400)}
          className={`rounded-3xl bg-paper-warm ${inFrame ? '' : 'p-6'}`}
          style={[
            inFrame ? { padding: framedPadding } : null,
            isDragging
              ? {
                  shadowColor: "#1a1410",
                  shadowOpacity: 0.18,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 8,
                }
              : null,
          ]}
        >
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
              <MaterialIcons
                name="local-fire-department"
                size={22}
                color="#fbf8f4"
              />
            </View>
            <View className="flex-1">
              <Text className="font-display text-xl text-ink">
                Défi quotidien
              </Text>
              <Text className="text-xs text-ink-muted">
                Lire au moins {goalMinutes} min par jour.
              </Text>
            </View>
            <Pressable
              onPress={() => setSettingsOpen(true)}
              accessibilityLabel="Paramètres du défi quotidien"
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full active:bg-paper-shade"
            >
              <MaterialIcons name="more-horiz" size={22} color="#6b6259" />
            </Pressable>
          </View>

          <View className="mt-6 flex-row justify-between">
            {strip.map((day) => {
              const done = completed.has(day);
              const isToday = day === today;
              const canToggle = day <= today && !autoDays.has(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => canToggle && toggleDay(day)}
                  disabled={!canToggle}
                  className="items-center gap-1.5"
                >
                  <Text
                    className={`text-xs ${isToday ? "text-ink" : "text-ink-muted"}`}
                  >
                    {frShortWeekday(day)}
                  </Text>
                  <View
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      done
                        ? "bg-accent"
                        : isToday
                          ? "border-2 border-ink/40 bg-paper"
                          : "bg-paper"
                    }`}
                  >
                    {done ? (
                      <Text className="text-paper">✓</Text>
                    ) : (
                      <Text className={isToday ? "text-ink" : "text-ink-muted"}>
                        {day.slice(8, 10)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-6">{todayButton()}</View>

          <View className="mt-5 flex-row gap-3">
            <View className="flex-1 items-center rounded-2xl bg-paper p-3">
              <Text className="font-display text-2xl text-ink">
                {stats.current}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted">
                Série actuelle
              </Text>
            </View>
            <View className="flex-1 items-center rounded-2xl bg-paper p-3">
              <Text className="font-display text-2xl text-ink">
                {stats.best}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted">Record</Text>
            </View>
            <View className="flex-1 items-center rounded-2xl bg-paper p-3">
              <Text className="font-display text-2xl text-ink">
                {completed.size}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted">Jours total</Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>

      <StreakSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

function StreakSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const goalMinutes = usePreferences((s) => s.dailyReadingGoalMinutes);
  const setGoal = usePreferences((s) => s.setDailyReadingGoalMinutes);
  const [value, setValue] = useState(String(goalMinutes));

  const onSave = () => {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) setGoal(n);
    onClose();
  };

  const adjust = (delta: number) => {
    const n = parseInt(value, 10) || 0;
    setValue(String(Math.max(1, n + delta)));
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60 px-6"
        style={{ justifyContent: "center" }}
      >
        <Pressable
          className="rounded-3xl bg-paper p-6"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="font-display text-2xl text-ink">
            Objectif quotidien
          </Text>
          <Text className="mt-2 text-ink-muted">
            Combien de minutes de lecture par jour pour valider le défi ?
          </Text>

          <View className="mt-5 flex-row items-center justify-center gap-4">
            <StepperButton onPress={() => adjust(-5)}>−5</StepperButton>
            <StepperButton onPress={() => adjust(-1)}>−</StepperButton>
            <View className="min-w-28 items-center rounded-2xl bg-paper-warm px-4 py-3">
              <TextInput
                value={value}
                onChangeText={setValue}
                keyboardType="number-pad"
                className="text-center font-display text-4xl text-ink"
                style={{ fontVariant: ["tabular-nums"] }}
                selectTextOnFocus
              />
              <Text className="mt-0.5 text-xs uppercase tracking-wider text-ink-muted">
                minutes
              </Text>
            </View>
            <StepperButton onPress={() => adjust(+1)}>+</StepperButton>
            <StepperButton onPress={() => adjust(+5)}>+5</StepperButton>
          </View>

          <View className="mt-5 flex-row flex-wrap justify-center gap-2">
            {PRESETS_MINUTES.map((p) => (
              <Pressable
                key={p}
                onPress={() => setValue(String(p))}
                className={`rounded-full px-4 py-2 ${
                  parseInt(value, 10) === p ? "bg-ink" : "bg-paper-warm"
                }`}
              >
                <Text
                  className={
                    parseInt(value, 10) === p ? "text-paper" : "text-ink"
                  }
                >
                  {p} min
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mt-4 text-center text-xs text-ink-muted">
            Synchronisé sur tous tes appareils.
          </Text>

          <View className="mt-6 gap-2">
            <Pressable
              onPress={onSave}
              className="rounded-full bg-accent py-3 active:opacity-80"
            >
              <Text className="text-center font-sans-med text-paper">
                Enregistrer
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="rounded-full border border-ink-muted/30 py-3 active:opacity-70"
            >
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StepperButton({
  onPress,
  children,
}: {
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="h-11 min-w-11 items-center justify-center rounded-full bg-paper-warm px-3 active:bg-paper-shade"
    >
      <Text className="font-sans-med text-ink">{children}</Text>
    </Pressable>
  );
}
