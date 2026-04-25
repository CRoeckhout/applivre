import { BookCover } from "@/components/book-cover";
import { BookStatusBar } from "@/components/book-status-bar";
import { GenreEditorModal } from "@/components/genre-editor-modal";
import { LoanTracker } from "@/components/loan-tracker";
import { ReadingTimer } from "@/components/reading-timer";
import { SheetCard } from "@/components/sheet-card";
import { formatDurationHuman } from "@/hooks/use-elapsed-time";
import { fetchBook } from "@/lib/books";
import { categorySuggestions, displayGenres } from "@/lib/genre";
import { newId } from "@/lib/id";
import { isCustomAppearance, mergeAppearance } from "@/lib/sheet-appearance";
import { useBookshelf } from "@/store/bookshelf";
import { useDebug } from "@/store/debug";
import { useReadingSheets } from "@/store/reading-sheets";
import { useSheetTemplates } from "@/store/sheet-templates";
import { useTimer } from "@/store/timer";
import type {
  Book,
  ReadingSession,
  ReadingStatus,
  UserBook,
} from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function BookDetailScreen() {
  const { isbn, action } = useLocalSearchParams<{
    isbn: string;
    action?: string;
  }>();
  const router = useRouter();
  const { books, addBook, updateStatus, removeBook } = useBookshelf();
  const setGenres = useBookshelf((s) => s.setGenres);
  const toggleFavorite = useBookshelf((s) => s.toggleFavorite);
  const sheets = useReadingSheets((s) => s.sheets);
  const [genreModalOpen, setGenreModalOpen] = useState(false);
  const [congratsOpen, setCongratsOpen] = useState(false);
  const [autoOpenFinish, setAutoOpenFinish] = useState(false);
  const debugOpen = useDebug((s) => s.panelsEnabled);
  const setDebugOpen = useDebug((s) => s.setPanelsEnabled);

  // Deeplinks depuis la Live Activity (applivre://book/<isbn>?action=...).
  // Expo Router résout la route + on consomme `action` ici.
  useEffect(() => {
    if (!action) return;
    if (action === "pause") {
      useTimer.getState().pause();
    } else if (action === "resume") {
      useTimer.getState().resume();
    } else if (action === "stop") {
      setAutoOpenFinish(true);
    }
    // Nettoie le param pour ne pas rejouer au re-render.
    router.setParams({ action: undefined });
  }, [action, router]);

  const existing = books.find((b) => b.book.isbn === isbn);
  const isSyntheticManualIsbn = !!isbn?.startsWith("manual-");

  // On ne tape l'API ni pour un livre déjà en biblio (on a déjà les métadonnées)
  // ni pour un ISBN synthétique (pas de chance qu'il soit trouvé ailleurs).
  const {
    data: fetched,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["book", isbn],
    queryFn: () => fetchBook(isbn!),
    enabled: !!isbn && !existing && !isSyntheticManualIsbn,
  });

  const data = existing?.book ?? fetched;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color="#c27b52" />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper px-8">
        <Text className="font-display text-2xl text-ink">
          Livre introuvable
        </Text>
        <Text className="mt-2 text-center text-ink-muted">
          L&apos;ISBN {isbn} n&apos;a pas été trouvé dans les catalogues
          automatiques.
        </Text>
        <Pressable
          onPress={() =>
            router.replace({
              pathname: "/book-manual",
              params: { isbn: isbn ?? "" },
            })
          }
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80"
        >
          <Text className="font-sans-med text-paper">Saisir manuellement</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          className="mt-3 rounded-full border border-ink-muted/30 px-6 py-3 active:opacity-70"
        >
          <Text className="text-ink-muted">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const onAdd = (status: ReadingStatus) => {
    addBook({
      id: newId(),
      userId: "local",
      book: data,
      status,
      favorite: false,
      startedAt: status === "reading" ? new Date().toISOString() : undefined,
      finishedAt: status === "read" ? new Date().toISOString() : undefined,
    });
  };

  const onStatusPress = (status: ReadingStatus) => {
    const wasRead = existing?.status === "read";
    if (existing) {
      const finalStatus = status === "read" || status === "abandoned";
      if (finalStatus) {
        const timer = useTimer.getState();
        const total = data.pages && data.pages > 0 ? data.pages : undefined;
        const lastPage = timer.lastPageFor(existing.id);
        // "Lu" + total connu → on marque la fin comme total pages.
        // Sinon → dernière page enregistrée.
        const stopPage =
          status === "read" && total ? total : Math.max(0, lastPage);

        // Termine la session active si elle concerne ce livre.
        if (timer.active?.userBookId === existing.id) {
          timer.stop(stopPage);
        }

        updateStatus(existing.id, status);
        // Clôture le cycle avec finalPage explicite (sans ça, fallback
        // sur max des sessions — mais si stop a été sauté faute de durée,
        // le total voulu serait perdu).
        timer.finishCycle(
          existing.id,
          status,
          status === "read" && total ? total : undefined,
        );
      } else {
        updateStatus(existing.id, status);
      }
    } else {
      onAdd(status);
    }
    if (status === "read" && !wasRead) {
      setCongratsOpen(true);
    }
  };

  return (
    <View className="flex-1 bg-paper">
      <ScrollView
        className="flex-1 bg-paper"
        contentContainerClassName="px-6 pt-6 pb-32"
      >
        <Animated.View entering={FadeIn.duration(400)} className="items-center">
          <BookCover
            isbn={data.isbn}
            coverUrl={data.coverUrl}
            style={{ width: 160, height: 240, borderRadius: 12 }}
            placeholderText="Pas de couverture"
            transition={300}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(400).delay(100)}
          className="mt-8 items-center"
        >
          <Text className="text-center font-display text-3xl text-ink">
            {data.title}
          </Text>
          {data.authors.length > 0 && (
            <Text className="mt-2 text-center text-ink-soft">
              {data.authors.join(", ")}
            </Text>
          )}
          {existing && <ReadCountBadge userBookId={existing.id} />}
          <View className="mt-3 flex-row flex-wrap justify-center gap-2">
            {data.pages ? <Tag>{data.pages} pages</Tag> : null}
            {data.publishedAt ? <Tag>{data.publishedAt}</Tag> : null}
            {!isSyntheticManualIsbn && data.isbn ? (
              <Tag>ISBN {data.isbn}</Tag>
            ) : null}
            {data.source === "manual" ? <Tag>Saisi manuellement</Tag> : null}
          </View>
          {__DEV__ && debugOpen && (
            <DebugBookPanel
              book={data}
              existing={existing}
              onClose={() => setDebugOpen(false)}
            />
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(400).delay(200)}
          className="mt-10"
        >
          {existing && (
            <GenreRow ub={existing} onEdit={() => setGenreModalOpen(true)} />
          )}
          {existing && <SheetPreview userBook={existing} />}

          {existing && (
            <ReadingTimer
              userBookId={existing.id}
              autoOpenFinish={autoOpenFinish}
              onFinishAutoOpenConsumed={() => setAutoOpenFinish(false)}
              onBookFinished={(finalPage) => {
                if (existing.status !== "read") {
                  updateStatus(existing.id, "read");
                  setCongratsOpen(true);
                }
                const total =
                  data.pages && data.pages > 0 ? data.pages : undefined;
                // Priorité : total si connu (Fini = livre entier),
                // sinon finalPage renvoyée par la modale.
                useTimer
                  .getState()
                  .finishCycle(existing.id, "read", total ?? finalPage);
              }}
            />
          )}
          {existing && (
            <ReadingStats
              userBookId={existing.id}
              totalPages={data.pages && data.pages > 0 ? data.pages : undefined}
            />
          )}
          {existing && <LoanTracker userBookId={existing.id} />}

          {existing && (
            <GenreEditorModal
              open={genreModalOpen}
              initial={displayGenres(existing)}
              suggestions={categorySuggestions(existing)}
              onClose={() => setGenreModalOpen(false)}
              onSave={(values) => setGenres(existing.id, values)}
            />
          )}

          {existing && (
            <Pressable
              onPress={() => {
                Alert.alert(
                  "Supprimer ce livre ?",
                  `« ${data.title} » sera retiré de ta bibliothèque.`,
                  [
                    { text: "Annuler", style: "cancel" },
                    {
                      text: "Supprimer",
                      style: "destructive",
                      onPress: () => {
                        removeBook(existing.id);
                        router.back();
                      },
                    },
                  ],
                );
              }}
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.12,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 6,
                elevation: 3,
              }}
              className="mt-8 flex-row items-center justify-center gap-2 rounded-full bg-white px-4 py-3 active:opacity-80"
            >
              <MaterialIcons name="delete-outline" size={20} color="#b8503a" />
              <Text style={{ color: "#b8503a" }} className="font-sans-med">
                Supprimer
              </Text>
            </Pressable>
          )}
        </Animated.View>

        <CongratsReadModal
          open={congratsOpen}
          hasSheet={!!(existing && sheets[existing.id])}
          onClose={() => setCongratsOpen(false)}
          onCreate={() => {
            setCongratsOpen(false);
            router.push(`/sheet/${isbn}`);
          }}
        />
      </ScrollView>
      <BookStatusBar
        existing={existing}
        onStatusPress={onStatusPress}
        onToggleFavorite={() => existing && toggleFavorite(existing.id)}
      />
    </View>
  );
}

function CongratsReadModal({
  open,
  hasSheet,
  onClose,
  onCreate,
}: {
  open: boolean;
  hasSheet: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  const iconName = hasSheet ? "edit-note" : "celebration";
  const title = hasSheet ? "Mets ta fiche à jour !" : "Félicitations !";
  const body = hasSheet
    ? "Tu as déjà une fiche pour ce livre. Complète-la avec ton avis final !"
    : "Ajoute une fiche de lecture pour dire ce que tu en as pensé.";
  const cta = hasSheet ? "Mettre à jour" : "Créer ma fiche";

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/40 px-8">
        <Animated.View
          entering={FadeIn.duration(220)}
          className="w-full max-w-sm rounded-3xl bg-paper p-6"
        >
          <View className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-pale">
              <MaterialIcons name={iconName} size={30} color="#c27b52" />
            </View>
            <Text className="mt-4 text-center font-display text-2xl text-ink">
              {title}
            </Text>
            <Text className="mt-2 text-center text-base text-ink-soft">
              {body}
            </Text>
          </View>

          <View className="mt-6 gap-2">
            <Pressable
              onPress={onCreate}
              className="items-center rounded-full bg-accent px-5 py-3 active:opacity-80"
            >
              <Text className="font-sans-med text-paper">{cta}</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="items-center rounded-full px-5 py-3 active:bg-paper-warm"
            >
              <Text className="text-ink-muted">Plus tard</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ReadingStats({
  userBookId,
  totalPages,
}: {
  userBookId: string;
  totalPages?: number;
}) {
  const allSessions = useTimer((s) => s.sessions);
  const cycles = useTimer((s) => s.cycles);
  const active = useTimer((s) => s.active);

  const bookCycles = useMemo(
    () =>
      cycles
        .filter((c) => c.userBookId === userBookId)
        .sort((a, b) => a.index - b.index),
    [cycles, userBookId],
  );
  const openCycle = bookCycles.find((c) => !c.finishedAt);
  const hasActiveCycle =
    !!openCycle && (!active || active.userBookId === userBookId);

  // Règle : active → stats du cycle en cours. Sinon → cumul tous cycles.
  const scopeCycleId = hasActiveCycle ? openCycle.id : null;
  const sessions = useMemo(
    () =>
      scopeCycleId
        ? allSessions.filter((s) => s.cycleId === scopeCycleId)
        : allSessions.filter((s) => s.userBookId === userBookId),
    [allSessions, scopeCycleId, userBookId],
  );

  const totalSec = useMemo(
    () => sessions.reduce((sum, s) => sum + s.durationSec, 0),
    [sessions],
  );
  const { currentPage, deltas } = useMemo(() => {
    const asc = [...sessions].sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
    const map = new Map<string, number>();
    let prev = 0;
    let max = 0;
    for (const s of asc) {
      map.set(s.id, Math.max(0, s.stoppedAtPage - prev));
      prev = s.stoppedAtPage;
      if (s.stoppedAtPage > max) max = s.stoppedAtPage;
    }
    return { currentPage: max, deltas: map };
  }, [sessions]);

  if (sessions.length === 0 && bookCycles.length === 0) return null;

  const pagesPerHour =
    totalSec > 0 ? Math.round((currentPage / totalSec) * 3600) : null;
  const progress = totalPages
    ? Math.min(100, Math.round((currentPage / totalPages) * 100))
    : null;

  const pastCycles = bookCycles.filter((c) => !!c.finishedAt);

  return (
    <View className="mt-8">
      <View className="mb-3 flex-row items-baseline justify-between">
        <Text className="font-display text-xl text-ink">Progression</Text>
        <Text className="text-xs text-ink-muted">
          {hasActiveCycle
            ? `Lecture ${openCycle!.index} en cours`
            : "Cumul de toutes les lectures"}
        </Text>
      </View>

      <View className="flex-row gap-3">
        <StatBox value={formatDurationHuman(totalSec)} label="Lecture" />
        <StatBox
          value={`p. ${currentPage}${totalPages ? ` / ${totalPages}` : ""}`}
          label={hasActiveCycle ? "Arrêt actuel" : "Dernière page"}
        />
        {pagesPerHour !== null && (
          <StatBox value={`${pagesPerHour}/h`} label="Rythme" />
        )}
      </View>

      {progress !== null && (
        <View className="mt-4">
          <View className="h-2 overflow-hidden rounded-full bg-paper-warm">
            <View
              className="h-full rounded-full bg-accent"
              style={{ width: `${progress}%` }}
            />
          </View>
          <Text className="mt-1 text-right text-xs text-ink-muted">
            {progress}%
          </Text>
        </View>
      )}

      {sessions.length > 0 && (
        <>
          <Text className="mt-6 mb-2 font-display text-lg text-ink">
            Dernières sessions
          </Text>
          {sessions.slice(0, 5).map((s) => (
            <SessionRow key={s.id} session={s} delta={deltas.get(s.id) ?? 0} />
          ))}
        </>
      )}

      {hasActiveCycle && pastCycles.length > 0 && (
        <PastCyclesSection cycles={pastCycles} />
      )}
    </View>
  );
}

function PastCyclesSection({
  cycles,
}: {
  cycles: {
    id: string;
    index: number;
    startedAt: string;
    finishedAt?: string;
    outcome?: "read" | "abandoned";
    finalPage?: number;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const sessionsInCycle = useTimer((s) => s.sessionsInCycle);

  return (
    <View className="mt-6">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between rounded-xl bg-paper-warm px-4 py-3 active:opacity-80"
      >
        <Text className="font-sans-med text-ink">
          Lectures précédentes ({cycles.length})
        </Text>
        <MaterialIcons
          name={open ? "expand-less" : "expand-more"}
          size={20}
          color="#6b6259"
        />
      </Pressable>
      {open && (
        <View className="mt-2 gap-2">
          {cycles.map((c) => {
            const cs = sessionsInCycle(c.id);
            const total = cs.reduce((sum, s) => sum + s.durationSec, 0);
            const startStr = new Date(c.startedAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            const endStr = c.finishedAt
              ? new Date(c.finishedAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : null;
            return (
              <View key={c.id} className="rounded-xl bg-paper-warm px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans-med text-ink">
                    Lecture {c.index}
                  </Text>
                  {c.outcome === "abandoned" && (
                    <View className="rounded-full bg-ink-muted/20 px-2 py-0.5">
                      <Text className="text-[10px] uppercase tracking-wide text-ink-muted">
                        Abandonnée
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="mt-1 text-xs text-ink-muted">
                  {startStr}
                  {endStr ? ` → ${endStr}` : ""} · {formatDurationHuman(total)}
                  {c.finalPage ? ` · p. ${c.finalPage}` : ""}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-paper-warm p-4">
      <Text className="font-display text-xl text-ink">{value}</Text>
      <Text className="mt-1 text-xs text-ink-muted">{label}</Text>
    </View>
  );
}

function SessionRow({
  session,
  delta,
}: {
  session: ReadingSession;
  delta: number;
}) {
  const date = new Date(session.startedAt);
  const dateStr = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
  return (
    <View className="mt-2 flex-row items-center justify-between rounded-xl bg-paper-warm px-4 py-3">
      <Text className="text-sm text-ink-soft">{dateStr}</Text>
      <View className="flex-row gap-4">
        <Text className="text-sm text-ink">
          {formatDurationHuman(session.durationSec)}
        </Text>
        <Text className="text-sm text-ink-muted">
          p. {session.stoppedAtPage}
          {delta > 0 ? ` · +${delta}` : ""}
        </Text>
      </View>
    </View>
  );
}

function SheetPreview({
  userBook,
  compact,
}: {
  userBook: UserBook;
  compact?: boolean;
}) {
  const router = useRouter();
  const sheet = useReadingSheets((s) => s.sheets[userBook.id]);
  const globalTemplate = useSheetTemplates((s) => s.global);

  const isbn = userBook.book.isbn;
  const hasContent = !!sheet && sheet.sections.length > 0;

  if (!hasContent) {
    return (
      <View className={compact ? "mb-6" : "mt-8"}>
        {!compact && (
          <Text className="mb-3 font-display text-xl text-ink">
            Fiche de lecture
          </Text>
        )}
        <Pressable
          onPress={() => router.push(`/sheet/${isbn}`)}
          className="overflow-hidden rounded-3xl bg-accent-pale p-5 active:opacity-80"
        >
          <View className="flex-row items-center gap-4">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
              <MaterialIcons name="edit-note" size={28} color="#fbf8f4" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-lg text-ink">
                Ta fiche t&apos;attend
              </Text>
              <Text className="mt-0.5 text-sm text-ink-soft">
                Personnages, histoire, avis, citations… garde tout ici.
              </Text>
            </View>
            <Text className="text-2xl text-accent-deep">›</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  const effective = mergeAppearance(globalTemplate, sheet.appearance);
  const isCustom = isCustomAppearance(sheet.appearance, globalTemplate);

  return (
    <View className={compact ? "mb-6" : "mt-8"}>
      {!compact && (
        <Text className="mb-3 font-display text-xl text-ink">
          Fiche de lecture
        </Text>
      )}
      <SheetCard
        userBook={userBook}
        sheet={sheet}
        appearance={effective}
        isCustom={isCustom}
        hideBookHeader={compact}
        onPress={() => router.push(`/sheet/${isbn}`)}
      />
    </View>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-full bg-paper-warm px-3 py-1">
      <Text className="text-xs text-ink-soft">{children}</Text>
    </View>
  );
}

// Ordinal court "2ème", "3ème"… — affiché seulement à partir de la 2e lecture.
function readCountLabel(n: number): string | null {
  if (n < 2) return null;
  if (n === 2) return "2ème lecture";
  if (n === 3) return "3ème lecture";
  return `${n}ème lecture`;
}

function ReadCountBadge({ userBookId }: { userBookId: string }) {
  // Sélecteur retourne un primitif pour stabilité entre renders
  // (pas de filter/map qui recréerait un tableau à chaque passage).
  const max = useTimer((s) => {
    let m = 0;
    for (const c of s.cycles) {
      if (c.userBookId === userBookId && c.index > m) m = c.index;
    }
    return m;
  });
  const label = readCountLabel(max);
  if (!label) return null;
  return (
    <View className="mt-2 flex-row items-center gap-1 rounded-full bg-accent-pale px-3 py-0.5">
      <Text className="text-xl">💖</Text>
      <Text className="text-xs font-sans-med text-accent-deep">{label}</Text>
    </View>
  );
}

function DebugBookPanel({
  book,
  existing,
  onClose,
}: {
  book: Book;
  existing: UserBook | undefined;
  onClose: () => void;
}) {
  const payload = {
    isbn: book.isbn,
    title: book.title,
    authors: book.authors,
    pages: book.pages,
    publishedAt: book.publishedAt,
    source: book.source,
    categories: book.categories,
    hasCover: !!book.coverUrl,
    existing: existing
      ? {
          id: existing.id,
          status: existing.status,
          genres: existing.genres,
          addedAt: existing.addedAt,
        }
      : null,
  };
  return (
    <View className="mt-4 self-stretch rounded-xl bg-ink/90 p-3">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-[10px] uppercase tracking-wider text-paper/60">
          debug
        </Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <MaterialIcons name="close" size={16} color="#ede4d3" />
        </Pressable>
      </View>
      <Text
        selectable
        className="text-[10px] leading-4 text-paper"
        style={{ fontFamily: "SpaceMono_400Regular" }}
      >
        {JSON.stringify(payload, null, 2)}
      </Text>
    </View>
  );
}

function GenreRow({ ub, onEdit }: { ub: UserBook; onEdit: () => void }) {
  const genres = displayGenres(ub);
  const fromUser = !!(ub.genres && ub.genres.length > 0);
  return (
    <View className="mt-6">
      <View className="mb-2 flex-row items-baseline gap-2">
        <Text className="font-display text-lg text-ink">Genres</Text>
        {genres.length > 0 && !fromUser ? (
          <Text className="text-xs text-ink-muted">depuis catalogue</Text>
        ) : null}
      </View>
      <Pressable
        onPress={onEdit}
        className="rounded-2xl bg-paper-warm p-4 active:bg-paper-shade"
      >
        {genres.length === 0 ? (
          <View className="flex-row items-center gap-3">
            <MaterialIcons name="local-offer" size={18} color="#6b6259" />
            <Text className="flex-1 text-base italic text-ink-muted">
              Aucun genre défini
            </Text>
            <MaterialIcons name="edit" size={18} color="#6b6259" />
          </View>
        ) : (
          <View className="flex-row items-center gap-3">
            <View className="flex-1 flex-row flex-wrap gap-2">
              {genres.map((g) => (
                <View key={g} className="rounded-full bg-paper px-3 py-1">
                  <Text className="text-sm text-ink">{g}</Text>
                </View>
              ))}
            </View>
            <MaterialIcons name="edit" size={18} color="#6b6259" />
          </View>
        )}
      </Pressable>
    </View>
  );
}
