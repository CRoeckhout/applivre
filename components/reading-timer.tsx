import { BookCover } from "@/components/book-cover";
import { formatDuration, useElapsedTime } from "@/hooks/use-elapsed-time";
import { useBookshelf } from "@/store/bookshelf";
import { useTimer } from "@/store/timer";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

type Props = {
  userBookId: string;
  autoOpenFinish?: boolean;
  onFinishAutoOpenConsumed?: () => void;
  // Déclenché quand l'user termine le livre (bouton "Fini" ou enregistre
  // au nombre total de pages). Le parent passe le livre en "read" + ouvre
  // la modale félicitations. `finalPage` permet de clôturer le cycle avec
  // la bonne page même si la session vient d'être jetée (<5s).
  onBookFinished?: (finalPage?: number) => void;
};

export function ReadingTimer({
  userBookId,
  autoOpenFinish,
  onFinishAutoOpenConsumed,
  onBookFinished,
}: Props) {
  const active = useTimer((s) => s.active);
  const start = useTimer((s) => s.start);
  const cancel = useTimer((s) => s.cancel);

  const bookStatus = useBookshelf(
    (s) => s.books.find((b) => b.id === userBookId)?.status,
  );

  const isActiveHere = active?.userBookId === userBookId;
  const isActiveElsewhere = !!active && !isActiveHere;

  if (!active) {
    const isReread = bookStatus === "read";
    return (
      <View className="mt-6">
        <StartReadingButton
          label={isReread ? "Relire mon livre" : "Commencer à lire"}
          icon={isReread ? "💖" : "▶"}
          onPress={() => start(userBookId)}
        />
      </View>
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
    <View className="mt-6">
      <ActiveTimerPanel
        autoOpenFinish={autoOpenFinish}
        onFinishAutoOpenConsumed={onFinishAutoOpenConsumed}
        onBookFinished={onBookFinished}
      />
    </View>
  );
}

type StartReadingBookContext = {
  isbn: string;
  coverUrl?: string;
  title: string;
  authors: string[];
};

export function StartReadingButton({
  label,
  icon,
  onPress,
  onLongPress,
  book,
  subtitle,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  onLongPress?: () => void;
  // Affiche couverture + titre du livre dans le bouton, sous le texte du
  // CTA. Activé sur la home (où aucun autre composant ne montre le livre
  // visé). Sur la fiche livre, omis car le détail affiche déjà le livre.
  book?: StartReadingBookContext;
  // Texte affiché sous le CTA quand `book` n'est pas fourni (ex: "3 livres
  // en cours" sur la home avec plusieurs livres en lecture).
  subtitle?: string;
}) {
  const hasFooter = !!book || !!subtitle;

  if (!hasFooter) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={onLongPress ? 280 : undefined}
        className="flex-row items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 active:opacity-80"
      >
        <Text className="text-xl text-paper">{icon}</Text>
        <Text className="font-sans-med text-paper">{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 280 : undefined}
      className="rounded-3xl bg-ink px-5 py-4 active:opacity-80"
    >
      <View className="flex-row items-center justify-center gap-2">
        <Text className="text-xl text-paper">{icon}</Text>
        <Text className="font-sans-med text-paper  text-xl">{label}</Text>
      </View>
      {book ? (
        <View className="mt-3 flex-row items-center justify-center gap-2">
          <BookCover
            isbn={book.isbn}
            coverUrl={book.coverUrl}
            style={{ width: 32, height: 48, borderRadius: 4 }}
          />
          <Text
            numberOfLines={1}
            className="flex-shrink text-sm text-paper-shade"
          >
            {book.title}
          </Text>
        </View>
      ) : (
        <Text className="mt-2 text-center text-sm text-paper-shade">
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
}

export function ActiveTimerPanel({
  autoOpenFinish,
  onFinishAutoOpenConsumed,
  onBookFinished,
  showBook = false,
  onPressBook,
  onLongPress,
}: {
  autoOpenFinish?: boolean;
  onFinishAutoOpenConsumed?: () => void;
  onBookFinished?: (finalPage?: number) => void;
  // Affiche un en-tête livre (couverture + titre + auteur) au-dessus du
  // panneau du timer. Sur la fiche livre, le détail affiche déjà le livre,
  // donc on garde ce flag à false. Sur la home, où la session vit hors
  // contexte du livre, on l'active pour montrer ce qui est en cours.
  showBook?: boolean;
  onPressBook?: () => void;
  onLongPress?: () => void;
}) {
  const active = useTimer((s) => s.active);
  const pause = useTimer((s) => s.pause);
  const resume = useTimer((s) => s.resume);
  const ub = useBookshelf((s) =>
    active ? s.books.find((b) => b.id === active.userBookId) : undefined,
  );
  const elapsed = useElapsedTime();
  const [finishOpen, setFinishOpen] = useState(false);

  useEffect(() => {
    if (autoOpenFinish) {
      setFinishOpen(true);
      onFinishAutoOpenConsumed?.();
    }
  }, [autoOpenFinish, onFinishAutoOpenConsumed]);

  if (!active) return null;
  const paused = active.pausedAt !== null;
  const showBookHeader = showBook && !!ub;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="rounded-3xl bg-ink p-8"
    >
      {showBookHeader && (
        <>
          <Pressable
            onPress={onPressBook}
            onLongPress={onLongPress}
            delayLongPress={280}
            className="flex-row items-center gap-3 active:opacity-80"
          >
            <BookCover
              isbn={ub.book.isbn}
              coverUrl={ub.book.coverUrl}
              style={{ width: 44, height: 66, borderRadius: 6 }}
            />
            <View className="flex-1">
              <Text
                numberOfLines={2}
                className="font-display text-lg text-paper"
              >
                {ub.book.title}
              </Text>
              {ub.book.authors[0] ? (
                <Text numberOfLines={1} className="text-sm text-paper-shade">
                  {ub.book.authors[0]}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <View className="my-6 h-px bg-paper/15" />
        </>
      )}

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
            onPress={resume}
            className="flex-1 rounded-full bg-accent px-6 py-3 active:opacity-80"
          >
            <Text className="text-center font-sans-med text-paper">
              Reprendre
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={pause}
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
  onBookFinished?: (finalPage?: number) => void;
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
    // pages === 0 = méta absente → pas de validation/clamp.
    const p = ub?.book.pages;
    return p && p > 0 ? p : undefined;
  });
  const [page, setPage] = useState("");

  const parsed = parseInt(page, 10);
  const overLimit =
    totalPages != null && Number.isFinite(parsed) && parsed > totalPages;

  const commit = (pageNum: number, markFinished: boolean) => {
    const safe = Math.max(0, pageNum);
    stop(safe);
    setPage("");
    onClose();
    if (markFinished) onBookFinished?.(safe);
  };

  const onSave = () => {
    const n = parseInt(page, 10);
    if (!Number.isFinite(n)) {
      commit(0, false);
      return;
    }
    const clamped = totalPages != null ? Math.min(n, totalPages) : n;
    const reachedTotal = totalPages != null && clamped >= totalPages;
    commit(clamped, reachedTotal);
  };

  // "Fini" marque toujours le livre terminé, avec ou sans pages connues.
  const onFini = () => {
    const n = parseInt(page, 10);
    const final = totalPages ?? (Number.isFinite(n) ? n : 0);
    commit(final, true);
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
        className="flex-1 bg-ink/60"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
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
            <Pressable
              onPress={onFini}
              className="rounded-full bg-ink py-3 active:opacity-80"
            >
              <Text className="text-center font-sans-med text-paper">
                J&apos;ai fini le livre
              </Text>
            </Pressable>
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
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
