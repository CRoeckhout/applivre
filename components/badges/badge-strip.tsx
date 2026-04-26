import { useBadges } from '@/store/badges';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Badge } from './badge';

type Props = {
  size?: number;
};

export function BadgeStrip({ size = 32 }: Props) {
  const earned = useBadges((s) => s.earned);

  const list = useMemo(() => {
    return Object.entries(earned)
      .sort(([, a], [, b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([key, earnedAt]) => ({ key, earnedAt }));
  }, [earned]);

  if (list.length === 0) return null;

  return (
    <View className="mt-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {list.map(({ key, earnedAt }) => (
          <Badge key={key} badgeKey={key} earnedAt={earnedAt} size={size} />
        ))}
      </ScrollView>
    </View>
  );
}
