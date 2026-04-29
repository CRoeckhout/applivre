import { HomeFab } from '@/components/home-fab';
import { SheetCard } from '@/components/sheet-card';
import { SheetCustomizer } from '@/components/sheet-customizer';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { isCustomAppearance, mergeAppearance } from '@/lib/sheet-appearance';
import { useBookshelf } from '@/store/bookshelf';
import { useReadingSheets } from '@/store/reading-sheets';
import { useSheetTemplates } from '@/store/sheet-templates';
import type { ReadingSheet, UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type Entry = { sheet: ReadingSheet; userBook: UserBook };

export default function SheetsScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const sheets = useReadingSheets((s) => s.sheets);
  const removeSheet = useReadingSheets((s) => s.removeSheet);
  const books = useBookshelf((s) => s.books);

  const confirmDelete = (entry: Entry) => {
    Alert.alert(
      'Supprimer la fiche ?',
      `« ${entry.userBook.book.title} » — les sections et les notes seront perdues.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => removeSheet(entry.userBook.id),
        },
      ],
    );
  };

  const globalTemplate = useSheetTemplates((s) => s.global);
  const setGlobalTemplate = useSheetTemplates((s) => s.setGlobal);
  const resetGlobal = useSheetTemplates((s) => s.resetGlobal);
  const globalIsPublic = useSheetTemplates((s) => s.globalIsPublic);
  const setGlobalIsPublic = useSheetTemplates((s) => s.setGlobalIsPublic);

  const [templateOpen, setTemplateOpen] = useState(false);

  const entries = useMemo<Entry[]>(() => {
    const bookById = new Map(books.map((b) => [b.id, b]));
    return Object.values(sheets)
      .map((sheet) => ({ sheet, userBook: bookById.get(sheet.userBookId) }))
      .filter((e): e is Entry => !!e.userBook)
      .sort(
        (a, b) =>
          new Date(b.sheet.updatedAt).getTime() - new Date(a.sheet.updatedAt).getTime(),
      );
  }, [sheets, books]);

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-28">
        <Animated.View
          entering={FadeInDown.duration(500)}
          className="flex-row items-center gap-3">
          <View className="flex-1">
            <Text className="font-display text-3xl text-ink">Mes fiches</Text>
            <Text className="mt-1 text-sm text-ink-muted">
              {entries.length === 0
                ? 'Note ce que tu penses des livres que tu lis.'
                : `${entries.length} fiche${entries.length > 1 ? 's' : ''} en cours`}
            </Text>
          </View>
          <Pressable
            onPress={() => setTemplateOpen(true)}
            accessibilityLabel="Éditer le template global"
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
            <MaterialIcons name="settings" size={20} color={theme.ink} />
          </Pressable>
        </Animated.View>

        {entries.length === 0 ? (
          <EmptyState onCreate={() => router.push('/sheet/new')} />
        ) : (
          <View className="mt-8 gap-3">
            {entries.map((e, i) => {
              const effective = mergeAppearance(globalTemplate, e.sheet.appearance);
              const isCustom = isCustomAppearance(e.sheet.appearance, globalTemplate);
              return (
                <Animated.View
                  key={e.sheet.userBookId}
                  entering={FadeIn.duration(300).delay(i * 40)}>
                  <Swipeable
                    renderRightActions={() => (
                      <DeleteAction onPress={() => confirmDelete(e)} />
                    )}
                    overshootRight={false}
                    rightThreshold={48}>
                    <SheetCard
                      userBook={e.userBook}
                      sheet={e.sheet}
                      appearance={effective}
                      isCustom={isCustom}
                      headerOnly
                      onPress={() => router.push(`/sheet/${e.userBook.book.isbn}`)}
                    />
                  </Swipeable>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <HomeFab />

      <SheetCustomizer
        open={templateOpen}
        appearance={globalTemplate}
        title="Template global"
        subtitle="Base par défaut pour toutes tes fiches"
        onClose={() => setTemplateOpen(false)}
        onSave={(next) => {
          setGlobalTemplate(next);
          setTemplateOpen(false);
        }}
        onReset={resetGlobal}
        resetLabel="Tout réinitialiser"
        publicToggle={{ value: globalIsPublic, onChange: setGlobalIsPublic }}
      />
    </SafeAreaView>
  );
}

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Supprimer la fiche"
      style={{ backgroundColor: '#b8503a' }}
      className="my-1 ml-2 items-center justify-center rounded-2xl px-5 active:opacity-80">
      <MaterialIcons name="delete-outline" size={24} color="#fbf8f4" />
      <Text className="mt-1 text-xs font-sans-med text-paper">Supprimer</Text>
    </Pressable>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(500).delay(150)}
      className="mt-10 items-center rounded-3xl bg-paper-warm p-8">
      <Text className="text-center font-display text-2xl text-ink">Aucune fiche</Text>
      <Text className="mt-2 text-center text-ink-muted">
        Les fiches de lecture te permettent de noter tes impressions, tes personnages favoris,
        ton avis sur l&apos;histoire.
      </Text>
      <Pressable
        onPress={onCreate}
        className="mt-6 rounded-full bg-accent px-6 py-3 active:opacity-80">
        <Text className="font-sans-med text-paper">+ Nouvelle fiche</Text>
      </Pressable>
    </Animated.View>
  );
}

