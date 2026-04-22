import { StreakCard } from '@/components/streak-card';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DefiScreen() {
  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-24">
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text className="font-display text-4xl text-ink">Défi</Text>
          <Text className="mt-1 text-base text-ink-muted">
            Prends l&apos;habitude de lire un peu chaque jour.
          </Text>
        </Animated.View>

        <View className="mt-6">
          <StreakCard />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
