import { usePaperScreenClass } from '@/components/app-fond-background';
import { CardFrame } from '@/components/card-frame';
import { CurrentReadingCard } from '@/components/current-reading-card';
import { HomeCogMenu } from '@/components/home-cog-menu';
import { HomeFab } from '@/components/home-fab';
import { LibraryRowCard } from '@/components/library-row-card';
import { ShortcutCard } from '@/components/shortcut-card';
import { StartReadingModal } from '@/components/start-reading-modal';
import { StreakCard } from '@/components/streak-card';
import { UserProfileCard } from '@/components/user-profile-card';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useBookshelf } from '@/store/bookshelf';
import {
  AVAILABLE_HOME_CARDS,
  usePreferences,
  type HomeCardId,
} from '@/store/preferences';
import { useReadingSheets } from '@/store/reading-sheets';
import { useTimer } from '@/store/timer';
import type { UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const paperScreen = usePaperScreenClass();
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const sheets = useReadingSheets((s) => s.sheets);
  const activeSession = useTimer((s) => s.active);
  const startTimer = useTimer((s) => s.start);
  const homeCardOrder = usePreferences((s) => s.homeCardOrder);
  const setHomeCardOrder = usePreferences((s) => s.setHomeCardOrder);
  const [pickerOpen, setPickerOpen] = useState(false);

  const insets = useSafeAreaInsets();

  const orderedIds = useMemo(() => resolveOrder(homeCardOrder), [homeCardOrder]);

  const readingBooks = useMemo(
    () => books.filter((b) => b.status === 'reading'),
    [books],
  );

  const launchReading = (ub: UserBook) => {
    startTimer(ub.id);
  };

  const onStartReadingPress = () => {
    if (activeSession) return;
    if (readingBooks.length === 1) {
      launchReading(readingBooks[0]);
      return;
    }
    setPickerOpen(true);
  };

  const sheetsCount = Object.keys(sheets).length;

  const startReadingSubtitle =
    readingBooks.length === 0
      ? 'Choisis un livre à lire'
      : readingBooks.length === 1
        ? readingBooks[0].book.title
        : `${readingBooks.length} livres en cours`;

  const cardDefs: Record<HomeCardId, CardDef> = {
    start_reading: {
      id: 'start_reading',
      title: 'Commencer ma lecture',
      subtitle: startReadingSubtitle,
      icon: 'play-circle-filled',
      onPress: onStartReadingPress,
    },
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
      // Rendu via <StreakCard /> directement (cf. renderItem), le subtitle
      // n'est pas affiché — on garde le slot pour rester homogène avec les
      // autres cardDefs.
      subtitle: '',
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
    if (item.id === 'start_reading') {
      return (
        <ScaleDecorator>
          <View style={{ marginBottom: 12 }}>
            <CurrentReadingCard
              readingBooks={readingBooks}
              onStartPress={onStartReadingPress}
              onLongPress={drag}
            />
          </View>
        </ScaleDecorator>
      );
    }
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
    <SafeAreaView className={`flex-1 ${paperScreen}`} edges={['top']}>
      <DraggableFlatList
        data={data}
        keyExtractor={(item) => item.id}
        onDragEnd={onDragEnd}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 120 }}
        ListHeaderComponent={<HomeHeader />}
        activationDistance={10}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 0,
          right: 0,
          zIndex: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 24,
        }}>
        <HomeProfileButton />
        <Image
          source={require('../../assets/images/icon.png')}
          style={{ width: 44, height: 44, borderRadius: 10 }}
          contentFit="contain"
          accessibilityLabel="Grimolia"
        />
        <HomeCogMenu />
      </View>
      <HomeFab />
      <StartReadingModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ub) => {
          setPickerOpen(false);
          launchReading(ub);
        }}
      />
    </SafeAreaView>
  );
}

function HomeHeader() {
  return (
    <Animated.View entering={FadeInDown.duration(500)}>
      <CardFrame>
        <UserProfileCard />
      </CardFrame>

      <View className="mt-6" />
    </Animated.View>
  );
}

function HomeProfileButton() {
  const router = useRouter();
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      accessibilityLabel="Mon profil"
      hitSlop={8}
      className="h-12 w-12 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
      <MaterialIcons name="person" size={22} color={theme.ink} />
    </Pressable>
  );
}
