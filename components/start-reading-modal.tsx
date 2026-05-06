import { BookCover } from '@/components/book-cover';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { READING_STATUS_META } from '@/lib/reading-status';
import { useBookshelf } from '@/store/bookshelf';
import type { UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (ub: UserBook) => void;
};

export function StartReadingModal({ open, onClose, onPick }: Props) {
  const router = useRouter();
  const books = useBookshelf((s) => s.books);

  const { reading, others } = useMemo(() => {
    const stamp = (b: UserBook) =>
      Date.parse(b.startedAt ?? b.addedAt ?? '') || 0;
    const reading = books
      .filter((b) => b.status === 'reading')
      .sort((a, b) => stamp(b) - stamp(a));
    const others = books
      .filter((b) => b.status !== 'reading')
      .sort((a, b) => stamp(b) - stamp(a));
    return { reading, others };
  }, [books]);

  const onAdd = () => {
    onClose();
    router.push('/scanner');
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-ink/60">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl bg-paper px-6 pb-10 pt-6"
          style={{ maxHeight: '85%' }}>
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-paper-shade" />
          <Text className="mt-3 font-display text-xl text-ink">
            Commencer ma lecture
          </Text>
          <Text className="mt-1 text-sm text-ink-muted">
            Choisis le livre à lire maintenant.
          </Text>

          {books.length === 0 ? (
            <View className="mt-8 items-center">
              <Text className="text-center text-ink-muted">
                Ta bibliothèque est vide.
              </Text>
              <Pressable
                onPress={onAdd}
                className="mt-4 rounded-full bg-accent px-6 py-3 active:opacity-80">
                <Text className="font-sans-med text-paper">Ajouter un livre</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              className="mt-4"
              contentContainerClassName="pb-2"
              showsVerticalScrollIndicator={false}>
              {reading.length > 0 && (
                <Section title="En cours">
                  {reading.map((ub) => (
                    <BookRow key={ub.id} ub={ub} onPress={() => onPick(ub)} />
                  ))}
                </Section>
              )}
              {others.length > 0 && (
                <Section title={reading.length > 0 ? 'Autres livres' : 'Ma bibliothèque'}>
                  {others.map((ub) => (
                    <BookRow key={ub.id} ub={ub} onPress={() => onPick(ub)} />
                  ))}
                </Section>
              )}
            </ScrollView>
          )}

          <Pressable
            onPress={onClose}
            className="mt-4 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
            <Text className="text-center text-ink-muted">Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-xs uppercase tracking-wider text-ink-muted">
        {title}
      </Text>
      <View className="gap-2">{children}</View>
    </View>
  );
}

function BookRow({ ub, onPress }: { ub: UserBook; onPress: () => void }) {
  const theme = useThemeColors();
  const meta = READING_STATUS_META[ub.status];
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl bg-paper-warm p-3 active:bg-paper-shade">
      <BookCover
        isbn={ub.book.isbn}
        coverUrl={ub.book.coverUrl}
        style={{ width: 44, height: 66, borderRadius: 6 }}
      />
      <View className="flex-1">
        <Text numberOfLines={2} className="font-display text-base text-ink">
          {ub.book.title}
        </Text>
        {ub.book.authors[0] ? (
          <Text numberOfLines={1} className="text-sm text-ink-soft">
            {ub.book.authors[0]}
          </Text>
        ) : null}
        <View
          style={{ backgroundColor: meta.color }}
          className="mt-1 self-start rounded-full px-2 py-0.5">
          <Text className="text-[11px] font-sans-med text-paper">
            {meta.label}
          </Text>
        </View>
      </View>
      <MaterialIcons name="play-arrow" size={22} color={theme.accentDeep} />
    </Pressable>
  );
}
