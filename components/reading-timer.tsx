import { formatDuration, useElapsedTime } from "@/hooks/use-elapsed-time";
import { useBookshelf } from "@/store/bookshelf";
import { useTimer } from "@/store/timer";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

type Props = {
  userBookId: string;
  autoOpenFinish?: boolean;
  onFinishAutoOpenConsumed?: () => void;
  // Déclenché quand l'user termine le livre (bouton "Fini" ou enregistre
  // au nombre total de pages). Le parent passe le livre en "read" + ouvre
  // la modale félicitations.
  onBookFinished?: () => void;
};

export function ReadingTimer({
  userBookId,
  autoOpenFinish,
  onFinishAutoOpenConsumed,
  onBookFinished,
}: Props) {
  const active = useTimer((s) => s.active);
  const start = useTimer((s) => s.start);
  const pause = useTimer((s) => s.pause);
  const resume = useTimer((s) => s.resume);
  const cancel = useTimer((s) => s.cancel);

  const isActiveHere = active?.userBookId === userBookId;
  const isActiveElsewhere = !!active && !isActiveHere;

  if (!active) {
    return (
      <Pressable
        onPress={() => start(userBookId)}
        className="mt-6 flex-row items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 active:opacity-80"
      >
        <Text className="text-xl text-paper">▶</Text>
        <Text className="font-sans-med text-paper">Commencer à lire</Text>
      </Pressable>
    );
  }

  if (isActiveElsewhere) {
    return (
      <View className="mt-6 rounded-2xl bg-paper-warm p-5">
        <Text className="text-center text-ink-soft">
          Une session de lecture est déjà en cours sur un autre livre.
        </Text>
        <Pressable
          onPress={cancel}
          className="mt-3 rounded-full bg-paper-shade py-2 active:opacity-80"
        >
          <Text className="text-center text-ink-muted">
            Annuler l&apos;autre session
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ActiveTimerPanel
      paused={active.pausedAt !== null}
      onPause={pause}
      onResume={resume}
      autoOpenFinish={autoOpenFinish}
      onFinishAutoOpenConsumed={onFinishAutoOpenConsumed}
      onBookFinished={onBookFinished}
    />
  );
}

function ActiveTimerPanel({
  paused,
  onPause,
  onResume,
  autoOpenFinish,
  onFinishAutoOpenConsumed,
  onBookFinished,
}: {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  autoOpenFinish?: boolean;
  onFinishAutoOpenConsumed?: () => void;
  onBookFinished?: () => void;
}) {
  const elapsed = useElapsedTime();
  const [finishOpen, setFinishOpen] = useState(false);

  useEffect(() => {
    if (autoOpenFinish) {
      setFinishOpen(true);
      onFinishAutoOpenConsumed?.();
    }
  }, [autoOpenFinish, onFinishAutoOpenConsumed]);

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="mt-6 rounded-3xl bg-ink p-8"
    >
      <Text
        style={{ fontVariant: ["tabular-nums"] }}
        className="text-center font-display text-6xl text-paper"
      >
        {formatDuration(elapsed)}
      </Text>
      <Text className="mt-2 text-center text-paper-shade">
        {paused ? "En pause" : "Session en cours"}
      </Text>

      <View className="mt-8 flex-row justify-center gap-3">
        {paused ? (
          <Pressable
            onPress={onResume}
            className="flex-1 rounded-full bg-accent px-6 py-3 active:opacity-80"
          >
            <Text className="text-center font-sans-med text-paper">
              Reprendre
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onPause}
            className="flex-1 rounded-full bg-paper/15 px-6 py-3 active:opacity-80"
          >
            <Text className="text-center font-sans-med text-paper">Pause</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => setFinishOpen(true)}
          className="flex-1 rounded-full bg-accent px-6 py-3 active:opacity-80"
        >
          <Text className="text-center font-sans-med text-paper">Terminer</Text>
        </Pressable>
      </View>

      <FinishSessionModal
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        onBookFinished={onBookFinished}
      />
    </Animated.View>
  );
}

function FinishSessionModal({
  open,
  onClose,
  onBookFinished,
}: {
  open: boolean;
  onClose: () => void;
  onBookFinished?: () => void;
}) {
  const stop = useTimer((s) => s.stop);
  const cancel = useTimer((s) => s.cancel);
  const active = useTimer((s) => s.active);
  const lastKnownPage = useTimer((s) =>
    active ? s.lastPageFor(active.userBookId) : 0,
  );
  const totalPages = useBookshelf((s) => {
    if (!active) return undefined;
    const ub = s.books.find((b) => b.id === active.userBookId);
    return ub?.book.pages;
  });
  const [page, setPage] = useState("");

  const parsed = parseInt(page, 10);
  const overLimit =
    totalPages != null && Number.isFinite(parsed) && parsed > totalPages;

  const commit = (pageNum: number) => {
    const reached = totalPages != null && pageNum >= totalPages;
    stop(Math.max(0, pageNum));
    setPage("");
    onClose();
    if (reached) onBookFinished?.();
  };

  const onSave = () => {
    const n = parseInt(page, 10);
    if (!Number.isFinite(n)) {
      stop(0);
      setPage("");
      onClose();
      return;
    }
    const clamped = totalPages != null ? Math.min(n, totalPages) : n;
    commit(clamped);
  };

  const onFini = () => {
    const n = parseInt(page, 10);
    const fallback = totalPages ?? (Number.isFinite(n) ? n : 0);
    commit(fallback);
  };

  const onDiscard = () => {
    cancel();
    setPage("");
    onClose();
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
          <Text className="font-display text-2xl text-ink">Fin de session</Text>
          <Text className="mt-2 text-ink-muted">
            À quelle page t&apos;es-tu arrêté·e ?
          </Text>
          {lastKnownPage > 0 && (
            <Text className="mt-1 text-xs text-ink-muted">
              Tu t&apos;étais arrêté·e page {lastKnownPage} la dernière fois.
            </Text>
          )}
          {totalPages != null && (
            <Text className="mt-1 text-xs text-ink-muted">
              Le livre fait {totalPages} pages.
            </Text>
          )}
          <TextInput
            value={page}
            onChangeText={(v) => {
              // N'accepte que chiffres. Clamp à totalPages.
              const digits = v.replace(/[^0-9]/g, "");
              if (!digits) return setPage("");
              const n = parseInt(digits, 10);
              const capped = totalPages != null ? Math.min(n, totalPages) : n;
              setPage(String(capped));
            }}
            keyboardType="number-pad"
            placeholder={lastKnownPage > 0 ? String(lastKnownPage) : "ex: 47"}
            placeholderTextColor="#6b6259"
            autoFocus
            className="mt-4 rounded-2xl bg-paper-warm px-5 py-4 text-center text-3xl text-ink"
            style={{ fontVariant: ["tabular-nums"] }}
          />
          {overLimit && (
            <Text className="mt-2 text-center text-xs text-[#c8322a]">
              Plafonné à {totalPages} pages.
            </Text>
          )}
          <View className="mt-6 gap-2">
            <Pressable
              onPress={onSave}
              className="rounded-full bg-accent py-3 active:opacity-80"
            >
              <Text className="text-center font-sans-med text-paper">
                Enregistrer
              </Text>
            </Pressable>
            {totalPages != null && (
              <Pressable
                onPress={onFini}
                className="rounded-full bg-ink py-3 active:opacity-80"
              >
                <Text className="text-center font-sans-med text-paper">
                  J&apos;ai fini le livre
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onDiscard}
              className="mt-6 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
            >
              <Text className="text-center text-ink-muted">
                Jeter la session
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
