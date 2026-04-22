import { BookCover } from '@/components/book-cover';
import { LoanTracker } from '@/components/loan-tracker';
import { RatingIcon } from '@/components/rating-row';
import { ReadingTimer } from '@/components/reading-timer';
import { formatDurationHuman } from '@/hooks/use-elapsed-time';
import { fetchBook } from '@/lib/books';
import { newId } from '@/lib/id';
import { useBookshelf } from '@/store/bookshelf';
import { useReadingSheets } from '@/store/reading-sheets';
import { useTimer } from '@/store/timer';
import type { ReadingStatus, ReadingSession } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUSES: { value: ReadingStatus; label: string }[] = [
  { value: 'to_read', label: 'À lire' },
  { value: 'reading', label: 'En cours' },
  { value: 'read', label: 'Lu' },
  { value: 'abandoned', label: 'Abandonné' },
];

export default function BookDetailScreen() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();
  const { books, addBook, updateStatus, removeBook } = useBookshelf();

  const existing = books.find((b) => b.book.isbn === isbn);
  const isSyntheticManualIsbn = !!isbn?.startsWith('manual-');

  // On ne tape l'API ni pour un livre déjà en biblio (on a déjà les métadonnées)
  // ni pour un ISBN synthétique (pas de chance qu'il soit trouvé ailleurs).
  const { data: fetched, isLoading, error } = useQuery({
    queryKey: ['book', isbn],
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
        <Text className="font-display text-2xl text-ink">Livre introuvable</Text>
        <Text className="mt-2 text-center text-ink-muted">
          L&apos;ISBN {isbn} n&apos;a pas été trouvé dans les catalogues automatiques.
        </Text>
        <Pressable
          onPress={() =>
            router.replace({ pathname: '/book-manual', params: { isbn: isbn ?? '' } })
          }
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80">
          <Text className="font-sans-med text-paper">Saisir manuellement</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          className="mt-3 rounded-full border border-ink-muted/30 px-6 py-3 active:opacity-70">
          <Text className="text-ink-muted">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const onAdd = (status: ReadingStatus) => {
    addBook({
      id: newId(),
      userId: 'local',
      book: data,
      status,
      favorite: false,
      startedAt: status === 'reading' ? new Date().toISOString() : undefined,
      finishedAt: status === 'read' ? new Date().toISOString() : undefined,
    });
  };

  return (
    <ScrollView className="flex-1 bg-paper" contentContainerClassName="px-6 pt-6 pb-24">
      <Animated.View entering={FadeIn.duration(400)} className="items-center">
        <BookCover
          isbn={data.isbn}
          coverUrl={data.coverUrl}
          style={{ width: 160, height: 240, borderRadius: 12 }}
          placeholderText="Pas de couverture"
          transition={300}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(100)} className="mt-8 items-center">
        <Text className="text-center font-display text-3xl text-ink">{data.title}</Text>
        {data.authors.length > 0 && (
          <Text className="mt-2 text-center text-ink-soft">{data.authors.join(', ')}</Text>
        )}
        <View className="mt-3 flex-row flex-wrap justify-center gap-2">
          {data.pages ? <Tag>{data.pages} pages</Tag> : null}
          {data.publishedAt ? <Tag>{data.publishedAt}</Tag> : null}
          {!isSyntheticManualIsbn && data.isbn ? <Tag>ISBN {data.isbn}</Tag> : null}
          {data.source === 'manual' ? <Tag>Saisi manuellement</Tag> : null}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(200)} className="mt-10">
        <Text className="mb-3 font-display text-xl text-ink">
          {existing ? 'Dans ta bibliothèque' : 'Ajouter à ma bibliothèque'}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {STATUSES.map((s) => {
            const active = existing?.status === s.value;
            return (
              <Pressable
                key={s.value}
                onPress={() => (existing ? updateStatus(existing.id, s.value) : onAdd(s.value))}
                className={`rounded-full px-4 py-2 ${active ? 'bg-accent' : 'bg-paper-warm active:bg-paper-shade'}`}>
                <Text className={active ? 'font-sans-med text-paper' : 'text-ink'}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {existing && <ReadingTimer userBookId={existing.id} />}
        {existing && <ReadingStats userBookId={existing.id} totalPages={data.pages} />}
        {existing && <LoanTracker userBookId={existing.id} />}
        {existing && <SheetPreview userBookId={existing.id} isbn={data.isbn} />}

        {existing && (
          <Pressable
            onPress={() => {
              removeBook(existing.id);
              router.back();
            }}
            className="mt-8 rounded-full border border-ink-muted/30 px-6 py-3 active:opacity-70">
            <Text className="text-center text-ink-muted">Retirer de ma bibliothèque</Text>
          </Pressable>
        )}
      </Animated.View>
    </ScrollView>
  );
}

function ReadingStats({ userBookId, totalPages }: { userBookId: string; totalPages?: number }) {
  const allSessions = useTimer((s) => s.sessions);
  const sessions = useMemo(
    () => allSessions.filter((s) => s.userBookId === userBookId),
    [allSessions, userBookId],
  );
  const totalSec = useMemo(
    () => sessions.reduce((sum, s) => sum + s.durationSec, 0),
    [sessions],
  );
  const { currentPage, deltas } = useMemo(() => {
    const asc = [...sessions].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
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

  if (sessions.length === 0) return null;

  const pagesPerHour = totalSec > 0 ? Math.round((currentPage / totalSec) * 3600) : null;
  const progress = totalPages ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : null;

  return (
    <View className="mt-8">
      <Text className="mb-3 font-display text-xl text-ink">Progression</Text>

      <View className="flex-row gap-3">
        <StatBox value={formatDurationHuman(totalSec)} label="Lecture" />
        <StatBox
          value={`p. ${currentPage}${totalPages ? ` / ${totalPages}` : ''}`}
          label="Arrêt actuel"
        />
        {pagesPerHour !== null && <StatBox value={`${pagesPerHour}/h`} label="Rythme" />}
      </View>

      {progress !== null && (
        <View className="mt-4">
          <View className="h-2 overflow-hidden rounded-full bg-paper-warm">
            <View className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </View>
          <Text className="mt-1 text-right text-xs text-ink-muted">{progress}%</Text>
        </View>
      )}

      <Text className="mt-6 mb-2 font-display text-lg text-ink">Dernières sessions</Text>
      {sessions.slice(0, 5).map((s) => (
        <SessionRow key={s.id} session={s} delta={deltas.get(s.id) ?? 0} />
      ))}
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

function SessionRow({ session, delta }: { session: ReadingSession; delta: number }) {
  const date = new Date(session.startedAt);
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return (
    <View className="mt-2 flex-row items-center justify-between rounded-xl bg-paper-warm px-4 py-3">
      <Text className="text-sm text-ink-soft">{dateStr}</Text>
      <View className="flex-row gap-4">
        <Text className="text-sm text-ink">{formatDurationHuman(session.durationSec)}</Text>
        <Text className="text-sm text-ink-muted">
          p. {session.stoppedAtPage}
          {delta > 0 ? ` · +${delta}` : ''}
        </Text>
      </View>
    </View>
  );
}

function SheetPreview({ userBookId, isbn }: { userBookId: string; isbn: string }) {
  const router = useRouter();
  const sheet = useReadingSheets((s) => s.sheets[userBookId]);
  const sections = sheet?.sections ?? [];

  return (
    <View className="mt-8">
      <Text className="mb-3 font-display text-xl text-ink">Fiche de lecture</Text>
      {sections.length === 0 ? (
        <Pressable
          onPress={() => router.push(`/sheet/${isbn}`)}
          className="overflow-hidden rounded-3xl bg-accent-pale p-5 active:opacity-80">
          <View className="flex-row items-center gap-4">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
              <MaterialIcons name="edit-note" size={28} color="#fbf8f4" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-lg text-ink">Ta fiche t&apos;attend</Text>
              <Text className="mt-0.5 text-sm text-ink-soft">
                Personnages, histoire, avis, citations… garde tout ici.
              </Text>
            </View>
            <Text className="text-2xl text-accent-deep">›</Text>
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push(`/sheet/${isbn}`)}
          className="rounded-2xl bg-paper-warm p-5 active:bg-paper-shade">
          <Text className="text-xs uppercase tracking-wider text-ink-muted">
            {sections.length} section{sections.length > 1 ? 's' : ''}
          </Text>
          {sections.slice(0, 2).map((s, i) => (
            <View key={s.id} className={i === 0 ? 'mt-3' : 'mt-4'}>
              <View className="flex-row items-center gap-2">
                <Text className="font-display text-base text-ink">{s.title || 'Sans titre'}</Text>
                {s.rating && (
                  <View className="flex-row">
                    {[1, 2, 3, 4, 5].map((i2) => (
                      <RatingIcon
                        key={i2}
                        kind={s.rating!.icon}
                        filled={s.rating!.value >= i2}
                        size={14}
                      />
                    ))}
                  </View>
                )}
              </View>
              {s.body ? (
                <Text numberOfLines={2} className="mt-1 text-sm text-ink-soft">
                  {s.body}
                </Text>
              ) : !s.rating ? (
                <Text className="mt-1 text-sm italic text-ink-muted">(vide)</Text>
              ) : null}
            </View>
          ))}
          {sections.length > 2 && (
            <Text className="mt-3 text-xs text-ink-muted">
              +{sections.length - 2} autre{sections.length - 2 > 1 ? 's' : ''}
            </Text>
          )}
        </Pressable>
      )}
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
