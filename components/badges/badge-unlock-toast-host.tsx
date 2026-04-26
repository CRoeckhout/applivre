import { BADGES } from '@/lib/badges/catalog';
import { useBadgeToasts } from '@/store/badge-toasts';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeIcon } from './badge-icon';
import { BadgeTooltip } from './badge-tooltip';

export function BadgeUnlockToastHost() {
  const queue = useBadgeToasts((s) => s.queue);
  const dismiss = useBadgeToasts((s) => s.dismiss);
  const paused = useBadgeToasts((s) => s.paused);
  const insets = useSafeAreaInsets();
  const current = queue[0];
  const [tooltipOpen, setTooltipOpen] = useState(false);
  // Décale légèrement le mount du Modal toast pour laisser à un Modal-écran
  // (ex : popup victoire bingo) le temps d'être démonté avant que le toast
  // soit présenté par iOS — sinon les deux modales sont demandées dans la
  // même frame et notre toast se retrouve masqué.
  const [mountedCurrent, setMountedCurrent] = useState<typeof current | null>(null);

  useEffect(() => {
    if (!current || paused > 0) {
      setMountedCurrent(null);
      setTooltipOpen(false);
      return;
    }
    const t = setTimeout(() => setMountedCurrent(current), 250);
    return () => clearTimeout(t);
  }, [current, paused]);

  if (!mountedCurrent || !current) return null;
  const def = BADGES[current.badgeKey];
  if (!def) return null;
  const count = def.showCount ? def.tier : undefined;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 0,
          right: 0,
          paddingHorizontal: 16,
          zIndex: 1000,
          elevation: 1000,
        }}>
        <Animated.View
          entering={FadeInUp.duration(220)}
          exiting={FadeOutUp.duration(180)}
          style={{ width: '100%' }}
          pointerEvents="box-none">
          <View className="flex-row items-center gap-2 rounded-2xl bg-ink px-3 py-3 shadow-lg">
            <Pressable
              onPress={() => setTooltipOpen(true)}
              className="flex-1 flex-row items-center gap-3"
              accessibilityLabel={`Voir le badge ${def.title}`}>
              <BadgeIcon primaryColor={def.primaryColor} count={count} size={40} />
              <View className="flex-1">
                <Text className="text-xs uppercase tracking-wide text-paper/70">
                  Nouveau badge débloqué !
                </Text>
                <Text className="font-display text-base text-paper" numberOfLines={1}>
                  {def.title}
                </Text>
                <Text className="text-xs text-paper/80" numberOfLines={2}>
                  {def.description}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => dismiss(current.id)}
              hitSlop={8}
              accessibilityLabel="Fermer la notification"
              className="rounded-full p-1">
              <MaterialIcons name="close" size={18} color="#fbf8f4" />
            </Pressable>
          </View>
        </Animated.View>
      </View>

      <BadgeTooltip
        visible={tooltipOpen}
        onClose={() => setTooltipOpen(false)}
        title={def.title}
        description={def.description}
        primaryColor={def.primaryColor}
        count={count}
      />
    </>
  );
}
