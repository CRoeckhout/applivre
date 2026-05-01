import { useCardFrame } from '@/components/card-frame-context';
import { useBookshelf } from '@/store/bookshelf';
import { useChallenges } from '@/store/challenges';
import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

const PRESETS = [12, 25, 50, 100];

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
}

export function ChallengeCard() {
  const year = new Date().getFullYear();
  const challenge = useChallenges((s) => s.challenges[year]);
  const books = useBookshelf((s) => s.books);
  const { inFrame, padding: framedPadding } = useCardFrame();

  const finishedCount = useMemo(
    () =>
      books.filter((b) => {
        if (b.status !== 'read' || !b.finishedAt) return false;
        return new Date(b.finishedAt).getFullYear() === year;
      }).length,
    [books, year],
  );

  const [editOpen, setEditOpen] = useState(false);

  if (!challenge) {
    return (
      <>
        <Animated.View
          entering={FadeIn.duration(400)}
          className={`rounded-3xl ${inFrame ? '' : 'bg-paper-warm p-6'}`}
          style={inFrame ? { padding: framedPadding } : undefined}>
          <Text className="font-display text-xl text-ink">Défi de lecture {year}</Text>
          <Text className="mt-2 text-ink-muted">
            Fixe un objectif de livres pour l&apos;année. On suivra ta progression auto.
          </Text>
          <Pressable
            onPress={() => setEditOpen(true)}
            className="mt-4 rounded-full bg-accent px-6 py-3 active:opacity-80">
            <Text className="text-center font-sans-med text-paper">Choisir un objectif</Text>
          </Pressable>
        </Animated.View>
        <EditChallengeModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          year={year}
          initial={null}
        />
      </>
    );
  }

  const frac = dayOfYear(new Date()) / daysInYear(year);
  const expected = challenge.target * frac;
  const delta = Math.round(finishedCount - expected);
  const progress = Math.min(100, Math.round((finishedCount / challenge.target) * 100));
  const projected = frac > 0 ? Math.round(finishedCount / frac) : 0;

  let paceLabel: string;
  let paceColor: string;
  if (finishedCount >= challenge.target) {
    paceLabel = 'Objectif atteint 🎉';
    paceColor = 'text-accent-deep';
  } else if (delta >= 1) {
    paceLabel = `En avance de ${delta} livre${delta > 1 ? 's' : ''}`;
    paceColor = 'text-accent-deep';
  } else if (delta <= -1) {
    const n = Math.abs(delta);
    paceLabel = `En retard de ${n} livre${n > 1 ? 's' : ''}`;
    paceColor = 'text-ink-soft';
  } else {
    paceLabel = 'Dans les temps';
    paceColor = 'text-ink-soft';
  }

  return (
    <>
      <Pressable onPress={() => setEditOpen(true)} className="active:opacity-90">
        <Animated.View
          entering={FadeIn.duration(400)}
          className={`rounded-3xl ${inFrame ? '' : 'bg-paper-warm p-6'}`}
          style={inFrame ? { padding: framedPadding } : undefined}>
          <View className="flex-row items-baseline justify-between">
            <Text className="font-display text-xl text-ink">Défi {year}</Text>
            <Text className="text-xs uppercase tracking-wider text-ink-muted">
              modifier
            </Text>
          </View>

          <View className="mt-3 flex-row items-baseline gap-2">
            <Text className="font-display text-5xl text-ink" style={{ fontVariant: ['tabular-nums'] }}>
              {finishedCount}
            </Text>
            <Text className="text-xl text-ink-soft">/ {challenge.target} livres</Text>
          </View>

          <View className="mt-4">
            <View className="h-2 overflow-hidden rounded-full bg-paper-shade">
              <View className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </View>
            <View className="mt-1 flex-row justify-between">
              <Text className={`text-sm ${paceColor}`}>{paceLabel}</Text>
              <Text className="text-sm text-ink-muted">{progress} %</Text>
            </View>
          </View>

          {projected > 0 && finishedCount < challenge.target && (
            <Text className="mt-3 text-xs text-ink-muted">
              À ce rythme : ≈ {projected} livre{projected > 1 ? 's' : ''} sur l&apos;année.
            </Text>
          )}
        </Animated.View>
      </Pressable>
      <EditChallengeModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        year={year}
        initial={challenge.target}
      />
    </>
  );
}

function EditChallengeModal({
  open,
  onClose,
  year,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  initial: number | null;
}) {
  const setTarget = useChallenges((s) => s.setTarget);
  const clearTarget = useChallenges((s) => s.clearTarget);
  const [value, setValue] = useState(String(initial ?? 25));

  const onSave = () => {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) {
      setTarget(year, n);
    }
    onClose();
  };

  const onClear = () => {
    clearTarget(year);
    onClose();
  };

  const adjust = (delta: number) => {
    const n = parseInt(value, 10) || 0;
    setValue(String(Math.max(1, n + delta)));
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60 px-6"
        style={{ justifyContent: 'center' }}>
        <Pressable className="rounded-3xl bg-paper p-6" onPress={(e) => e.stopPropagation()}>
          <Text className="font-display text-2xl text-ink">Défi {year}</Text>
          <Text className="mt-2 text-ink-muted">Combien de livres cette année ?</Text>

          <View className="mt-5 flex-row items-center justify-center gap-4">
            <StepperButton onPress={() => adjust(-1)}>−</StepperButton>
            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              className="min-w-24 rounded-2xl bg-paper-warm px-6 py-3 text-center font-display text-4xl text-ink"
              style={{ fontVariant: ['tabular-nums'] }}
              selectTextOnFocus
            />
            <StepperButton onPress={() => adjust(+1)}>+</StepperButton>
          </View>

          <View className="mt-5 flex-row justify-center gap-2">
            {PRESETS.map((p) => (
              <Pressable
                key={p}
                onPress={() => setValue(String(p))}
                className={`rounded-full px-4 py-2 ${
                  parseInt(value, 10) === p ? 'bg-ink' : 'bg-paper-warm'
                }`}>
                <Text
                  className={parseInt(value, 10) === p ? 'text-paper' : 'text-ink'}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-6 gap-2">
            <Pressable onPress={onSave} className="rounded-full bg-accent py-3 active:opacity-80">
              <Text className="text-center font-sans-med text-paper">Enregistrer</Text>
            </Pressable>
            {initial !== null && (
              <Pressable
                onPress={onClear}
                className="rounded-full border border-ink-muted/30 py-3 active:opacity-70">
                <Text className="text-center text-ink-muted">Retirer le défi</Text>
              </Pressable>
            )}
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
      className="h-12 w-12 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
      <Text className="text-2xl text-ink">{children}</Text>
    </Pressable>
  );
}
