import { CardFrame } from '@/components/card-frame';
import { HomeCogMenu } from '@/components/home-cog-menu';
import { HomeFab } from '@/components/home-fab';
import { LibraryRowCard } from '@/components/library-row-card';
import { ShortcutCard } from '@/components/shortcut-card';
import { StreakCard } from '@/components/streak-card';
import { UserProfileCard } from '@/components/user-profile-card';
import { dayOffset, todayIso } from '@/lib/date';
import { useBookshelf } from '@/store/bookshelf';
import {
  AVAILABLE_HOME_CARDS,
  usePreferences,
  type HomeCardId,
} from '@/store/preferences';
import { useReadingSheets } from '@/store/reading-sheets';
import { useReadingStreak } from '@/store/reading-streak';
import { useTimer } from '@/store/timer';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

function resolveOrder(saved: HomeCardId[]): HomeCardId[] {
  const known = saved.filter((id) => AVAILABLE_HOME_CARDS.includes(id));
  const missing = AVAILABLE_HOME_CARDS.filter((id) => !known.includes(id));
  return [...known, ...missing];
}

type CardDef = {
  id: HomeCardId;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
};

export default function HomeScreen() {
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const sheets = useReadingSheets((s) => s.sheets);
  const manualStreakDays = useReadingStreak((s) => s.manualDays);
  const sessions = useTimer((s) => s.sessions);
  const goalMinutes = usePreferences((s) => s.dailyReadingGoalMinutes);
  const homeCardOrder = usePreferences((s) => s.homeCardOrder);
  const setHomeCardOrder = usePreferences((s) => s.setHomeCardOrder);

  const orderedIds = useMemo(() => resolveOrder(homeCardOrder), [homeCardOrder]);

  // Sous-titre défi : série en cours calculée live
  const streakSubtitle = useMemo(() => {
    const thresholdSec = goalMinutes * 60;
    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const d = s.startedAt.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + s.durationSec);
    }
    const completed = new Set(manualStreakDays);
    for (const [d, total] of byDay) {
      if (total >= thresholdSec) completed.add(d);
    }
    const today = todayIso();
    const yesterday = dayOffset(today, -1);
    let cursor = completed.has(today) ? today : completed.has(yesterday) ? yesterday : null;
    let n = 0;
    while (cursor && completed.has(cursor)) {
      n++;
      cursor = dayOffset(cursor, -1);
    }
    if (n === 0) return "Commence ta série aujourd'hui";
    return `Série de ${n} jour${n > 1 ? 's' : ''} en cours`;
  }, [manualStreakDays, sessions, goalMinutes]);

  const sheetsCount = Object.keys(sheets).length;

  const cardDefs: Record<HomeCardId, CardDef> = {
    library: {
      id: 'library',
      title: 'Ma bibliothèque',
      subtitle:
        books.length === 0
          ? 'Commence ta collection'
          : `${books.length} livre${books.length > 1 ? 's' : ''} dans ta collection`,
      icon: 'menu-book',
      onPress: () => router.push('/library'),
    },
    sheets: {
      id: 'sheets',
      title: 'Mes fiches de lecture',
      subtitle:
        sheetsCount === 0
          ? 'Note tes avis sur tes lectures'
          : `${sheetsCount} fiche${sheetsCount > 1 ? 's' : ''} en cours`,
      icon: 'edit-note',
      onPress: () => router.push('/sheets'),
    },
    defi: {
      id: 'defi',
      title: 'Mes défis',
      subtitle: streakSubtitle,
      icon: 'local-fire-department',
      onPress: () => router.push('/defi'),
    },
  };

  const data = useMemo(() => orderedIds.map((id) => cardDefs[id]), [orderedIds, cardDefs]);

  const onDragEnd = ({ data: next }: { data: CardDef[] }) => {
    const ids = next.map((c) => c.id);
    // Évite la sync inutile si l'ordre n'a pas changé
    if (ids.join(',') === orderedIds.join(',')) return;
    setHomeCardOrder(ids);
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<CardDef>) => {
    if (item.id === 'defi') {
      return (
        <ScaleDecorator>
          <View style={{ marginBottom: 12 }}>
            <CardFrame>
              <StreakCard onLongPress={drag} isDragging={isActive} />
            </CardFrame>
          </View>
        </ScaleDecorator>
      );
    }
    if (item.id === 'library') {
      return (
        <ScaleDecorator>
          <View style={{ marginBottom: 12 }}>
            <CardFrame>
              <LibraryRowCard
                books={books}
                onPress={item.onPress}
                onLongPress={drag}
                isDragging={isActive}
              />
            </CardFrame>
          </View>
        </ScaleDecorator>
      );
    }
    return (
      <ScaleDecorator>
        <View style={{ marginBottom: 12 }}>
          <CardFrame>
            <ShortcutCard
              title={item.title}
              subtitle={item.subtitle}
              icon={item.icon}
              onPress={item.onPress}
              onLongPress={drag}
              isDragging={isActive}
            />
          </CardFrame>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <DraggableFlatList
        data={data}
        keyExtractor={(item) => item.id}
        onDragEnd={onDragEnd}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 120 }}
        ListHeaderComponent={<HomeHeader />}
        activationDistance={10}
      />
      <HomeFab />
    </SafeAreaView>
  );
}

function HomeHeader() {
  return (
    <>
      <Animated.View
        entering={FadeInDown.duration(500)}
        className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="font-display text-4xl text-ink">Accueil</Text>
          <Text className="mt-1 text-base text-ink-muted">Ton tableau de bord lecture.</Text>
        </View>
        <HomeCogMenu />
      </Animated.View>

      <CardFrame>
        <UserProfileCard />
      </CardFrame>

      <View className="mt-6" />
    </>
  );
}
