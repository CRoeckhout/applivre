import { BookCover } from "@/components/book-cover";
import { MusicPlayerPanel } from "@/components/reading-music/music-player-panel";
import { SessionNoteEditorModal } from "@/components/session-note-editor-modal";
import { formatDuration, useElapsedTime } from "@/hooks/use-elapsed-time";
import { useBookshelf } from "@/store/bookshelf";
import { useTimer } from "@/store/timer";
import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const setDraftNote = useTimer((s) => s.setDraftNote);
  const ub = useBookshelf((s) =>
    active ? s.books.find((b) => b.id === active.userBookId) : undefined,
  );
  const elapsed = useElapsedTime();
  const [finishOpen, setFinishOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

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
            onPress={() => resume()}
            className="flex-1 rounded-full bg-accent px-6 py-3 active:opacity-80"
          >
            <Text className="text-center font-sans-med text-paper">
              Reprendre
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => pause()}
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

      {/* Bouton Notes : ouvre l'éditeur. Affiche "Modifier ma note" quand un
          draft existe déjà — l'user voit immédiatement qu'il en a écrit une. */}
      <Pressable
        onPress={() => setNoteOpen(true)}
        accessibilityLabel="Ajouter une note à cette session"
        className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-paper/10 px-4 py-2.5 active:opacity-70"
      >
        <MaterialIcons
          name={active.draftNote?.trim() ? 'edit-note' : 'note-add'}
          size={18}
          color="#fbf8f4"
        />
        <Text className="font-sans-med text-sm text-paper">
          {active.draftNote?.trim() ? 'Modifier ma note' : 'Ajouter une note'}
        </Text>
      </Pressable>

      <MusicPlayerPanel />

      <SessionNoteEditorModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        initialValue={active.draftNote}
        onSave={(text) => setDraftNote(text)}
        title="Note de session"
        subtitle="Brouillon — sauvegardé à la fin de la session."
      />

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
  // Note pré-remplie depuis le draft (saisi pendant la session). À la
  // fermeture du modal, on resync ce local state quand open passe à true.
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote(active?.draftNote ?? "");
  }, [open, active?.draftNote]);

  const parsed = parseInt(page, 10);
  const overLimit =
    totalPages != null && Number.isFinite(parsed) && parsed > totalPages;

  const commit = (pageNum: number, markFinished: boolean) => {
    const safe = Math.max(0, pageNum);
    stop(safe, note);
    setPage("");
    setNote("");
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
  // Action non-réversible (clôt le cycle, change le statut du livre) → on
  // demande confirmation pour éviter un tap accidentel à côté du save.
  const onFini = () => {
    const n = parseInt(page, 10);
    const final = totalPages ?? (Number.isFinite(n) ? n : 0);
    Alert.alert(
      "Tu as fini le livre ?",
      "Le livre passera en « lu » et ce cycle de lecture sera clôturé.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Oui, j'ai fini",
          style: "default",
          onPress: () => commit(final, true),
        },
      ],
    );
  };

  // Jeter perd la session en cours (temps + éventuelle note draft). Pareil :
  // confirmation pour éviter de tout perdre par accident.
  const onDiscard = () => {
    Alert.alert(
      "Jeter cette session ?",
      "Le temps écoulé et la note en cours seront perdus. Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Jeter",
          style: "destructive",
          onPress: () => {
            cancel();
            setPage("");
            setNote("");
            onClose();
          },
        },
      ],
    );
  };

  const insets = useSafeAreaInsets();

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
        {/* paddingTop/Bottom = insets pour respecter la safe area top
            (status bar) et bottom (home indicator). justifyContent: center
            calé sur l'espace disponible entre les insets → la modal ne
            déborde plus quand le clavier monte (le ScrollView interne
            scrolle si le contenu dépasse). */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 12,
          }}
        >
        <Pressable
          className="rounded-3xl bg-paper"
          onPress={(e) => e.stopPropagation()}
        >
        <ScrollView
          contentContainerStyle={{ padding: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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

          {/* Note libre — optionnelle. Pré-remplie depuis le draft saisi
              pendant la session. Persistée avec la session au tap save. */}
          <Text className="mt-5 mb-2 text-xs font-sans-med uppercase text-ink-muted">
            Note (optionnel)
          </Text>
          <View className="rounded-2xl bg-paper-warm px-4 py-3">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Ce que tu retiens, un passage…"
              placeholderTextColor="#6b6259"
              multiline
              maxLength={5000}
              textAlignVertical="top"
              style={{ color: "#1a1410", minHeight: 80, fontSize: 14 }}
            />
          </View>

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
        </ScrollView>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
